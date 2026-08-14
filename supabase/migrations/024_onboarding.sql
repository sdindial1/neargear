-- ============================================================
-- 024: First-run onboarding state
--
-- Records that a user has seen (or dismissed) the welcome experience at
-- /welcome. Server-side rather than localStorage on purpose: a seller who
-- signs up on their phone from an ad and later opens the site on a laptop
-- should not be greeted again as a brand-new user.
--
-- Nullable timestamp rather than a boolean — "when" is strictly more
-- information than "whether", and it lets us measure the gap between signup
-- and first listing later without another migration.
--
-- No backfill. Existing users have NULL, which would normally mean "show the
-- welcome". They will not see it, because /welcome also skips anyone who
-- already has a listing or a Stripe account, and every current user predates
-- this feature. Backfilling would be the safer-looking choice and the wrong
-- one: it would erase the distinction between "dismissed it" and "never had
-- the chance", which is exactly what we would want to query on later.
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN users.onboarding_completed_at IS
  'When the user finished or dismissed the /welcome first-run experience. NULL means never shown.';
