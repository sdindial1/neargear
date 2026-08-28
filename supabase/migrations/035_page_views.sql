-- ============================================================
-- 035: Server-side page-view logging for /giveaway and /sell
--
-- WHY: we have one signup from roughly 40 reported ad landing-page views and no
-- idea where the other 39 went. Worse, the 40 is META'S number — we have never
-- had our own. A funnel whose first step is a figure supplied by the party
-- being measured is not a funnel; it is a restatement of their invoice.
--
-- TWO ROUTES ONLY. /giveaway is where the ads land and /sell is the conversion
-- action. Logging everything would produce a table that grows with browsing
-- traffic and answers a question nobody asked. The allowlist lives in the client
-- component, and this table records whatever it is told — so widening it later
-- is a code change, deliberately, not a config someone flips.
--
-- NO THIRD-PARTY ANALYTICS. This is ~40 rows a day into a table we already
-- back up, against a script tag that would ship another vendor's JS to every
-- visitor, need a privacy-policy entry, and be blocked by the same ad blockers
-- that already cost us pixel events.
--
-- WHAT IS DELIBERATELY NOT STORED: no IP address, no user agent, no fingerprint.
-- The privacy policy discloses "pages visited" and "referring URLs" (§3.2) and
-- this stays inside that. session_id is a random client-generated string with no
-- identity attached; it exists so repeat views in one visit can be collapsed
-- into one visitor, and for nothing else.
--
-- UNAUTHENTICATED BY NECESSITY. The whole point is measuring visitors who have
-- no account, so the write endpoint cannot require a session. That means the
-- counts are inflatable by anyone who wants to POST in a loop. Accepted: the
-- figure this exists to sanity-check is Meta's, and a deliberately poisoned
-- number would be visible as an obvious spike. Do not build billing or payouts
-- on it.
--
-- RETENTION: 180 days, matching the search-log line already added to the privacy
-- policy (§8). No automatic purge yet — POST-LAUNCH item when the table has
-- enough rows to matter.
-- ============================================================

CREATE TABLE IF NOT EXISTS page_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Allow-listed by the client component. Stored rather than enum-constrained
  -- so adding a route is a one-line code change, not a migration.
  path        TEXT NOT NULL,

  -- First-touch campaign parameters as they appeared on THIS view. Distinct
  -- from users.attribution_*, which is the first touch of a visitor who went on
  -- to create an account. Most rows here will never become a signup — that gap
  -- is the entire measurement.
  utm_source   TEXT,
  utm_medium   TEXT,
  utm_campaign TEXT,
  fbclid       TEXT,
  referrer     TEXT,

  -- Random per-visit string from the browser. No identity, no persistence
  -- across visits. Present so N views by one person are not counted as N people.
  session_id  TEXT,

  -- Populated only when the viewer already had a session. NULL is the common
  -- and expected case.
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,

  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- The funnel groups by day and by source over a trailing window.
CREATE INDEX IF NOT EXISTS page_views_path_created_idx
  ON page_views (path, created_at DESC);
CREATE INDEX IF NOT EXISTS page_views_created_idx
  ON page_views (created_at DESC);
CREATE INDEX IF NOT EXISTS page_views_utm_source_idx
  ON page_views (utm_source, created_at DESC)
  WHERE utm_source IS NOT NULL;

-- Service role only, same shape as sweepstakes_entries (022) and
-- moderation_events (025): written by the API route, read by /admin. Nothing
-- here is for the browser to read back, and the anon key must not be able to
-- enumerate visitor sessions.
ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON page_views FROM anon, authenticated;

COMMENT ON TABLE page_views IS
  'Server-side view log for /giveaway and /sell only. Exists so the funnel has '
  'a first step we measured ourselves rather than one reported by Meta. No IP, '
  'no user agent. Service-role only.';

NOTIFY pgrst, 'reload schema';
