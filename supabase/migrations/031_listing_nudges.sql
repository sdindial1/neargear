-- ============================================================
-- 031: "You signed up but haven't listed" nudge sequence
--
-- Audience is people who ALREADY have an account and zero listings. The
-- conversion being bought is a first listing, not a signup — they have already
-- signed up.
--
-- THE HARD GUARANTEE IS THE UNIQUE INDEX, NOT THE CODE.
-- "A user who never lists must never be emailed a fourth time" is enforced by
-- UNIQUE (user_id, step) with step constrained to 1..3. A route-level "have we
-- sent this already?" check cannot win a race: two cron invocations, or a
-- retried invocation, would both read "not sent" and both send. The index makes
-- the second one fail with 23505, which the sender translates into a skip.
-- Same reasoning as the AMOE daily limit in 022.
--
-- CANCELLATION IS IMPLICIT, AND THAT IS DELIBERATE.
-- There is no "cancelled" row to write when someone lists. Eligibility is
-- computed as "has an account, has zero listings, is not unsubscribed, enough
-- time has elapsed, this step not already sent" — so creating a listing removes
-- the user from the eligible set by construction. An explicit cancellation
-- write would be a second thing that can silently fail, and a cancel that
-- silently does nothing is precisely the failure shape this codebase keeps
-- hitting. Nothing to fail is stronger than something that reports success.
--
-- UNSUBSCRIBE IS SEPARATE FROM TRANSACTIONAL, PERMANENTLY.
-- nudge_unsubscribed_at governs THIS sequence only. A seller who opts out of
-- nudges must still receive "your item sold", "a buyer is waiting to pay you"
-- and every other transactional send — those are not marketing and are not
-- optional while the account is active (privacy policy 7.3).
--
-- The token is a UUID on the user row rather than an HMAC, so that revoking it
-- is an UPDATE rather than a secret rotation that would invalidate every link
-- in every inbox at once.
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS nudge_unsubscribed_at TIMESTAMP WITH TIME ZONE,
  -- Defaulted, so existing users get a token immediately and no backfill pass
  -- is needed. Unguessable and per-user: a leaked link unsubscribes exactly one
  -- person and can be rotated for that person alone.
  ADD COLUMN IF NOT EXISTS unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS users_unsubscribe_token_idx
  ON users (unsubscribe_token);

COMMENT ON COLUMN users.nudge_unsubscribed_at IS
  'Opted out of the listing-nudge sequence ONLY. Transactional email (sales, '
  'payouts, disputes) is unaffected and must remain so.';

-- ============================================================
-- One row per email actually attempted. This is also what the signups view
-- reads to show nudge state per user, and what makes "listed after nudge 2"
-- measurable — hence recording failures rather than only successes.
-- ============================================================
CREATE TABLE IF NOT EXISTS listing_nudges (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- 1 = T+24h, 2 = T+72h, 3 = T+7d and final. There is no step 4.
  step       SMALLINT NOT NULL CHECK (step IN (1, 2, 3)),

  --   sent       handed to Resend and accepted
  --   failed     attempted and rejected; occupies the slot on purpose, so a
  --              broken address is not retried forever
  --   suppressed sending was disabled or deliverability was not green; the
  --              slot is NOT occupied (see the partial unique index below)
  status     TEXT NOT NULL DEFAULT 'sent'
             CHECK (status IN ('sent', 'failed', 'suppressed')),

  provider_id TEXT,
  error       TEXT,
  sent_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- THE guarantee. Partial, so a 'suppressed' dry-run row does not permanently
-- consume a step that was never actually delivered.
CREATE UNIQUE INDEX IF NOT EXISTS listing_nudges_user_step_idx
  ON listing_nudges (user_id, step)
  WHERE status IN ('sent', 'failed');

CREATE INDEX IF NOT EXISTS listing_nudges_user_idx
  ON listing_nudges (user_id, sent_at DESC);

-- Service role only, same shape as sweepstakes_entries in 022: written by the
-- cron route, read by /admin. Nothing here is for the browser.
ALTER TABLE listing_nudges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON listing_nudges FROM anon, authenticated;

COMMENT ON TABLE listing_nudges IS
  'One row per nudge email attempted. UNIQUE(user_id, step) WHERE status IN '
  '(sent,failed) is the hard cap of three per user. Service-role only.';

NOTIFY pgrst, 'reload schema';
