-- ============================================================
-- 027: ListingCreated dispatch probe  *** TEMPORARY — DELETE THIS ***
--
-- This migration exists to answer ONE question and should be dropped as soon
-- as it has. It is not part of the data model.
--
-- THE QUESTION: ListingCreated has reached Meta once across ~22 listings. Two
-- explanations were proposed and BOTH are dead:
--
--   "the call is buffered in the fbq stub queue and never flushed"
--       Refuted: router.push() is a SOFT navigation. The document is never torn
--       down, so fbq.queue survives and flushes whenever fbevents.js loads.
--
--   "the call is dispatched but the beacon is cut off by the navigation"
--       Refuted by the SAME objection: if nothing is torn down, nothing aborts
--       an in-flight request either.
--
-- So the cause is something not yet named. Meta's Events Manager can tell us
-- whether an event ARRIVED; it cannot tell us whether one was ever SENT. These
-- two columns record the browser's own account of what it did, so the two
-- sources can be compared. The decisive signal is the DISAGREEMENT:
--
--   dispatched + Meta has it      -> fixed. Drop this migration.
--   dispatched + Meta has nothing -> the event leaves the browser and Meta
--                                    discards it. Look at fbq('init') timing,
--                                    a pixel-ID mismatch, and custom-event
--                                    handling — NOT at the client send path.
--   queued / absent               -> fbevents.js never loaded in that session.
--                                    No client-side fix helps; the durable
--                                    answer is the Conversions API (newEventId
--                                    already exists so browser and server
--                                    events can be deduplicated).
--
-- WRITE PATH: service role only, via POST /api/listings/pixel-dispatch. The
-- client is NOT granted UPDATE on these columns and must never be — the anon
-- key ships in the browser bundle, so an anon-writable diagnostic would record
-- whatever a caller felt like claiming. That is the same reasoning that moved
-- listing creation server-side in 025/026; a probe that can be forged answers
-- nothing.
--
-- Nullable with no default and no backfill. NULL means "no report" — either a
-- listing from before this shipped, or one where the report never arrived
-- (fire-and-forget, so that is expected and is itself a data point). A default
-- would erase the distinction between "not reported" and "reported as X".
--
-- TO REMOVE (do this once the question is answered):
--   ALTER TABLE listings
--     DROP COLUMN IF EXISTS pixel_dispatch_status,
--     DROP COLUMN IF EXISTS pixel_dispatch_at;
--   DROP INDEX IF EXISTS listings_pixel_dispatch_idx;
--   -- then delete src/app/api/listings/pixel-dispatch/route.ts and the
--   -- fire-and-forget block in src/app/sell/page.tsx.
-- ============================================================

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS pixel_dispatch_status TEXT,
  ADD COLUMN IF NOT EXISTS pixel_dispatch_at     TIMESTAMP WITH TIME ZONE;

-- Constrained to the DispatchStatus union in src/lib/meta-pixel.ts. If a value
-- outside this set ever appears the two have drifted, and a rejected write is a
-- better outcome than a probe quietly recording garbage.
ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_pixel_dispatch_status_check;
ALTER TABLE listings ADD CONSTRAINT listings_pixel_dispatch_status_check
  CHECK (
    pixel_dispatch_status IS NULL
    OR pixel_dispatch_status IN
       ('disabled', 'opted_out', 'absent', 'queued', 'dispatched')
  );

COMMENT ON COLUMN listings.pixel_dispatch_status IS
  'TEMPORARY PROBE (migration 027). What the browser reported doing with the '
  'ListingCreated pixel event. Compare against Meta Events Manager: the '
  'disagreement is the diagnosis. Drop once ListingCreated is confirmed.';
COMMENT ON COLUMN listings.pixel_dispatch_at IS
  'TEMPORARY PROBE (migration 027). When the browser reported the outcome.';

-- Partial index: the probe only ever queries the reported rows, which are a
-- small and (hopefully) short-lived slice of the table.
CREATE INDEX IF NOT EXISTS listings_pixel_dispatch_idx
  ON listings (pixel_dispatch_status, created_at DESC)
  WHERE pixel_dispatch_status IS NOT NULL;

NOTIFY pgrst, 'reload schema';
