-- ============================================================
-- 030: Signup attribution
--
-- WHY THIS CANNOT WAIT AND CANNOT BE BACKFILLED. Ads are live and spending.
-- Meta reports conversions using its own attribution model, and we currently
-- have no independent record of where a signup came from — so Meta's claim
-- cannot be checked against anything. Every hour of paid traffic that arrives
-- before this ships is signal that is permanently gone: fbclid and utm_* live
-- only in the URL of the landing request, and document.referrer only in that
-- browser at that moment. Nothing reconstructs them later.
--
-- FIRST-TOUCH, not last-touch. The question is which ad brought this person to
-- NearGear, not which page they happened to be on when they finally signed up.
-- The client-side capture writes once and never overwrites (see
-- src/lib/attribution.ts).
--
-- ALL NULLABLE, NO DEFAULT, NO BACKFILL. Existing users stay NULL and the admin
-- view renders them as "unknown". A default of 'direct' or 'organic' would be a
-- guess wearing the costume of data, and would be indistinguishable from a real
-- direct arrival the moment it mattered.
--
-- PURELY ADDITIVE. No policy change, no visibility change. The existing
-- "Users can insert their own row" policy already permits these columns, which
-- is how the signup path writes them.
--
-- FORGEABLE, DELIBERATELY. These are written by the browser during signup, so a
-- determined user could claim any utm_source they liked. That is accepted here:
-- the only person who could forge it is the person it describes, and there is
-- nothing to gain. Contrast listings.status in 026, where the incentive was
-- real and the write had to move server-side. Noting the distinction so the
-- precedent is not read as "client writes are fine".
--
-- PRIVACY: Referring URLs are already disclosed in the privacy policy (3.2,
-- "Device and Usage Information"), and fbclid/utm_* are components of the URL
-- the visitor arrived on, covered by the same line. No policy change is
-- required for this migration. If attribution is ever joined to advertising
-- identifiers or shared with a third party, that changes and 5.2 needs a row.
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS attribution_fbclid       TEXT,
  ADD COLUMN IF NOT EXISTS attribution_utm_source   TEXT,
  ADD COLUMN IF NOT EXISTS attribution_utm_medium   TEXT,
  ADD COLUMN IF NOT EXISTS attribution_utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS attribution_referrer     TEXT,
  -- The path they first landed on. Not requested, but it is the difference
  -- between "an ad worked" and "which ad creative worked" when utm_* is absent,
  -- and it is free to capture at the same moment.
  ADD COLUMN IF NOT EXISTS attribution_landing_path TEXT,
  -- When the landing happened, NOT when the row was written. Signup can be days
  -- later; the gap between the two is the consideration window.
  ADD COLUMN IF NOT EXISTS attribution_captured_at  TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN users.attribution_utm_source IS
  'First-touch utm_source from the landing URL. NULL = unknown (pre-dates '
  'migration 030, or arrived with no campaign parameters). Never defaulted.';
COMMENT ON COLUMN users.attribution_captured_at IS
  'When the LANDING was captured, not when the account was created. The gap '
  'between this and users.created_at is how long they considered.';

-- The signups view filters and groups on source, over a window on created_at.
CREATE INDEX IF NOT EXISTS users_attribution_idx
  ON users (attribution_utm_source, created_at DESC)
  WHERE attribution_utm_source IS NOT NULL;

NOTIFY pgrst, 'reload schema';
