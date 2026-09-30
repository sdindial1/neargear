-- ============================================================
-- 037: Narrow giveaway_events to the funnel, and add a rejection reason
--
-- SAME TABLE AS 036. This alters it rather than adding a second one: a funnel
-- split across two tables is a funnel nobody queries correctly twice.
--
-- WHAT IS ADDED
--   reason  why an attempt failed. Populated for entry_rejected only today
--           (bad_zip, duplicate_today, other) and left NULL by every other
--           event. Text rather than an enum so a new failure mode is a code
--           change, not a migration plus a deploy-ordering problem.
--
-- WHAT IS REMOVED, AND WHY THIS IS NOT DATA LOSS
--   utm_source, utm_medium, utm_campaign, fbclid, user_id.
--
--   The brief for this table is now explicit: session id, event name,
--   timestamp and reason, and no personal data. fbclid is an identifier for a
--   single person's single ad click and user_id names an account outright, so
--   neither belongs here under that rule. Enforcing it in the schema is worth
--   more than enforcing it in a code review — a column that does not exist
--   cannot be filled in by a well-meaning patch eighteen months from now.
--
--   Nothing is lost. Campaign attribution for the same visit already lives in
--   page_views (035), written on the landing view and keyed by the SAME
--   session_id this table carries, because both now read it from
--   src/lib/session-id.ts. Attribution for a signup already lives on
--   users.attribution_* (030). The join replaces the copy.
--
--   Safe to drop: the table is empty. Verified immediately before this
--   migration was applied, and the two rows it had ever held were test rows
--   deleted during the step-1 verification.
--
-- STILL NO EMAIL, NAME OR ZIP, AND NO ENTRY ID EITHER. The identity of an
-- entrant lives in sweepstakes_entries, behind the service role. Nothing here
-- joins to it and nothing here needs to: every question this table exists to
-- answer — how many arrived, how many started, how many finished, why the rest
-- did not — is answered by counting rows within it.
-- ============================================================

ALTER TABLE giveaway_events
  ADD COLUMN IF NOT EXISTS reason TEXT;

ALTER TABLE giveaway_events
  DROP COLUMN IF EXISTS utm_source,
  DROP COLUMN IF EXISTS utm_medium,
  DROP COLUMN IF EXISTS utm_campaign,
  DROP COLUMN IF EXISTS fbclid,
  DROP COLUMN IF EXISTS user_id;

-- The index on utm_source went with its column.
DROP INDEX IF EXISTS giveaway_events_utm_source_idx;

-- "How many of each event, and for the rejections, why" is the whole query.
CREATE INDEX IF NOT EXISTS giveaway_events_event_reason_idx
  ON giveaway_events (event, reason, created_at DESC);

COMMENT ON TABLE giveaway_events IS
  'Funnel events for /giveaway: view, step1, completed, rejected, listing CTA, '
  'marketplace link, signup. Session id, event, timestamp and reason ONLY - no '
  'personal data, no entry id. Campaign attribution for the same visit is in '
  'page_views, joined on session_id. Service-role only.';

COMMENT ON COLUMN giveaway_events.reason IS
  'Populated for entry_rejected: bad_zip, duplicate_today, other. NULL otherwise.';

NOTIFY pgrst, 'reload schema';
