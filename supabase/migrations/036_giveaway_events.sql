-- ============================================================
-- 036: Funnel events for the rebuilt /giveaway landing page
--
-- WHY: 035 gave us our own view count (518 and climbing). It cannot tell us
-- anything after the view. The rebuilt page has three further moments worth
-- measuring, and none of them is a page load, so none of them fits page_views:
--
--   entry_submitted      a free entry was accepted and a sweepstakes_entries
--                        row now exists.
--   listing_cta_clicked  the visitor tapped "list gear" from the post-entry
--                        success state. The whole rebuild is a bet that asking
--                        AFTER commitment converts better than asking before,
--                        and this is the number that settles it.
--   signup_completed     an account was created in the same visit as that tap.
--
-- THE VIEW IS DELIBERATELY NOT DUPLICATED HERE. page_views already holds it,
-- loadFunnel() already reads it, and 518 rows of history cannot be backfilled
-- into a new table. The two are joined on session_id, which is why that value
-- now comes from one shared module (src/lib/session-id.ts) rather than a
-- constant re-declared per writer.
--
-- THE DATABASE IS THE SOURCE OF TRUTH, NOT THE PIXEL. Meta under-reported
-- ListingCreated for ~22 listings before anyone noticed. Every event here is
-- also fired at the pixel, but when the two disagree this table wins.
--
-- NOT A REPLACEMENT FOR sweepstakes_entries. An entry_submitted row is
-- telemetry; the entry itself is the sweepstakes_entries row, which is what a
-- drawing is conducted from and what Rules 7 is answerable to. If this table
-- were dropped tomorrow the promotion would still be administrable.
--
-- WHAT IS DELIBERATELY NOT STORED: no email, no name, no ZIP, no IP, no user
-- agent. This table says that an entry happened, never who made it. The
-- identity lives in sweepstakes_entries, behind the service role, and joining
-- the two is not a thing any code here does.
--
-- UNAUTHENTICATED BY NECESSITY, same as 035: the visitors worth measuring have
-- no account yet, so the write endpoint cannot require a session. Counts are
-- therefore inflatable by anyone willing to POST in a loop. Accepted for the
-- same reason as 035 - do not build billing or payouts on it.
-- ============================================================

CREATE TABLE IF NOT EXISTS giveaway_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Allow-listed by the API route. Text rather than an enum so adding a step
  -- to the funnel is a code change, not a migration plus a deploy ordering
  -- problem.
  event        TEXT NOT NULL,

  -- Joins to page_views.session_id. NULL when the browser refused storage,
  -- which drops the row out of session-joined queries but not out of totals.
  session_id   TEXT,

  -- The campaign parameters as they appeared on the landing view, carried
  -- forward so an event is attributable without a join succeeding.
  utm_source   TEXT,
  utm_medium   TEXT,
  utm_campaign TEXT,
  fbclid       TEXT,

  -- Set only for signup_completed, where an account provably exists by the
  -- time the event fires. NULL for everything before it, which is the point.
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,

  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Counting one event type over a trailing window is the query this table
-- exists for.
CREATE INDEX IF NOT EXISTS giveaway_events_event_created_idx
  ON giveaway_events (event, created_at DESC);

-- The funnel walks view -> entry -> cta -> signup for a single visit.
CREATE INDEX IF NOT EXISTS giveaway_events_session_idx
  ON giveaway_events (session_id)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS giveaway_events_utm_source_idx
  ON giveaway_events (utm_source, created_at DESC)
  WHERE utm_source IS NOT NULL;

-- Service role only, matching page_views (035), sweepstakes_entries (022) and
-- moderation_events (025). Written by the API route, read by /admin. The anon
-- key must not be able to enumerate or forge visitor sessions.
ALTER TABLE giveaway_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON giveaway_events FROM anon, authenticated;

COMMENT ON TABLE giveaway_events IS
  'Funnel events after the /giveaway view: entry_submitted, listing_cta_clicked, '
  'signup_completed. Joined to page_views on session_id. Carries no personal '
  'data - the entry itself lives in sweepstakes_entries. Service-role only.';

NOTIFY pgrst, 'reload schema';
