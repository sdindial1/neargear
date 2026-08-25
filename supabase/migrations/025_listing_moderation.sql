-- ============================================================
-- 025: Listing moderation — taxonomy enforcement + content screening
--
-- Ads point strangers at /sell. Two different problems arrive with them:
-- items that are not sports gear (a phone, a couch) and items that are not
-- allowed anywhere (weapons, adult content). This migration is the storage and
-- the enforcement floor for both; the classifier lives in
-- src/lib/moderation/classify.ts.
--
-- THE STATUS VALUE IS 'pending_review', NOT 'pending'.
-- 'pending' is already taken and means something else entirely: a BUYER has
-- requested the item and it is reserved (src/app/listings/[id]/request/...).
-- Reusing it would have made "reserved" and "held for review" indistinguishable
-- in every query we have.
--
-- WHY status AND NOT A SEPARATE moderation_status COLUMN:
-- three surfaces already filter on status = 'active' and all three then behave
-- correctly with no code change --
--   * RLS: "Active listings are viewable by everyone" is
--          USING (status = 'active' OR seller_id = auth.uid()), so a held
--          listing is invisible to everyone except its own seller. The hold
--          needs no new policy.
--   * /giveaway public counter (Official Rules 3(a), "500 total active
--          listings") does not count held listings.
--   * /admin/giveaway drawing audit only counts entries for listings that are
--          still active, which is Rules 4.1's "remains posted and active".
-- A held listing therefore earns no sweepstakes entry until it is approved,
-- and on approval it earns one -- created_at is unchanged, so it still falls
-- inside the Promotion Period window the audit filters on. That is the rule as
-- written; no amendment to the Official Rules is required.
--
-- A parallel moderation_status column would have left all three surfaces
-- counting listings nobody can see.
-- ============================================================

-- ============================================================
-- 1. The new status value.
--
-- Named constraint from 001's inline CHECK. Dropping and re-adding is the only
-- way to widen it; IF EXISTS keeps this replayable on a fresh database where
-- the constraint was created moments earlier by 001.
-- ============================================================
ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_status_check;

ALTER TABLE listings ADD CONSTRAINT listings_status_check
  CHECK (status IN ('active', 'sold', 'removed', 'pending', 'pending_review'));

COMMENT ON COLUMN listings.status IS
  'active = live on the marketplace. pending = a buyer has requested it '
  '(reserved). pending_review = held by moderation, invisible to everyone but '
  'the seller, earns no sweepstakes entry. sold / removed = terminal.';

-- ============================================================
-- 2. Why a listing was held, and who cleared it.
--
-- These live on the listing rather than only in moderation_events because the
-- admin queue renders them next to the photo, and a join for the one field the
-- reviewer actually reads is not worth it.
-- ============================================================
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS moderation_verdict     TEXT,
  ADD COLUMN IF NOT EXISTS moderation_reasons     TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS moderation_confidence  REAL,
  ADD COLUMN IF NOT EXISTS moderated_at           TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS moderated_by           TEXT;

COMMENT ON COLUMN listings.moderation_verdict IS
  'Classifier verdict at publish time: allow | review | error. "error" means '
  'the classifier failed and the listing was published anyway (fail-open) -- '
  'these need a retroactive sweep, which /admin/moderation surfaces.';
COMMENT ON COLUMN listings.moderation_reasons IS
  'Machine-readable trigger codes, e.g. {not_sports, photo_text_mismatch}. '
  'Rendered in the admin queue so the reviewer sees WHY without re-reading.';
COMMENT ON COLUMN listings.moderated_by IS
  'Admin email that approved or rejected. NULL while auto-decided.';

-- The admin queue reads exactly this. Partial index: the queue is a handful of
-- rows against a table that is mostly active listings.
CREATE INDEX IF NOT EXISTS listings_pending_review_idx
  ON listings (created_at)
  WHERE status = 'pending_review';

-- Fail-open sweep: find listings that published without a real verdict.
CREATE INDEX IF NOT EXISTS listings_moderation_error_idx
  ON listings (created_at)
  WHERE moderation_verdict = 'error';

-- ============================================================
-- 3. moderation_events -- every verdict, including the ones with no listing.
--
-- A hard-blocked submission never becomes a listing row, so without this table
-- we would have no way to see that anyone tried. Volume here is the signal
-- that tells us whether the gate is being probed.
--
-- ACCESS MODEL: SERVICE ROLE ONLY, same as sweepstakes_entries in 022. RLS on
-- with no policies, and table grants revoked. It holds the text and photo URLs
-- of rejected submissions, which is content we should not expose to anon.
-- ============================================================
CREATE TABLE IF NOT EXISTS moderation_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NULL when the submission was hard-blocked and no listing was ever created.
  listing_id  UUID REFERENCES listings(id) ON DELETE SET NULL,
  seller_id   UUID REFERENCES users(id) ON DELETE SET NULL,

  verdict     TEXT NOT NULL
              CHECK (verdict IN ('allow', 'review', 'block', 'error')),
  -- Where the verdict came from: 'prescreen' (deterministic keyword pass,
  -- runs with no API call) or 'model'. Lets us measure how much of the load
  -- the cheap path is carrying.
  source      TEXT NOT NULL DEFAULT 'model'
              CHECK (source IN ('prescreen', 'model')),
  reasons     TEXT[] NOT NULL DEFAULT '{}',
  confidence  REAL,
  model       TEXT,

  -- Snapshot of what was submitted. The listing may later be edited or
  -- deleted; the thing we judged has to stay judgeable.
  title       TEXT,
  description TEXT,
  photo_urls  TEXT[] DEFAULT '{}',

  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS moderation_events_created_idx
  ON moderation_events (created_at DESC);
CREATE INDEX IF NOT EXISTS moderation_events_verdict_idx
  ON moderation_events (verdict, created_at DESC);

ALTER TABLE moderation_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON moderation_events FROM anon, authenticated;

COMMENT ON TABLE moderation_events IS
  'Every classifier verdict, including hard-blocks that never became listings. '
  'Service-role only: RLS enabled with no policies and grants revoked. Written '
  'by POST /api/listings; read by /admin/moderation.';

-- NOTE: the INSERT policy that pins client-side inserts to 'pending_review'
-- is deliberately NOT here -- it is in 026. Everything in 025 is additive and
-- safe to apply against the running app; 026 is the breaking half and goes out
-- with the code that depends on it. See 026's header.

-- ============================================================
-- 4. No self-approval.
--
-- The INSERT policy pins new rows to 'pending_review', but the UPDATE policy
-- lets a seller edit their own listing -- including its status. Without this
-- trigger the bypass is two calls instead of one: insert held, then update to
-- active.
--
-- A trigger rather than a WITH CHECK because the rule is about the TRANSITION,
-- and WITH CHECK only sees the new row. Expressed as a WITH CHECK on the new
-- status alone it would have to forbid status = 'active' outright, which would
-- break every ordinary edit of an already-live listing.
--
-- Only enforced against 'authenticated'. service_role (moderation approving)
-- and direct postgres connections (_recon tooling) pass through. Withdrawal is
-- deliberately still allowed: a seller may pull a listing that is under
-- review, they just cannot publish it.
-- ============================================================
CREATE OR REPLACE FUNCTION enforce_moderation_hold()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'pending_review'
     AND NEW.status <> 'pending_review'
     AND NEW.status <> 'removed'
     AND COALESCE(auth.role(), '') = 'authenticated'
  THEN
    RAISE EXCEPTION
      'listing % is under review; only moderation can publish it', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION enforce_moderation_hold() IS
  'Blocks a seller from moving their own listing out of pending_review. '
  'Withdrawal to removed is allowed; publishing is not. service_role bypasses.';

DROP TRIGGER IF EXISTS listings_moderation_hold ON listings;
CREATE TRIGGER listings_moderation_hold
  BEFORE UPDATE ON listings
  FOR EACH ROW
  EXECUTE FUNCTION enforce_moderation_hold();

NOTIFY pgrst, 'reload schema';
