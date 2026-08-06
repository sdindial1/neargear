-- $500 Bat Giveaway — free alternate method of entry (AMOE) storage.
--
-- Sweepstakes law requires a genuinely free way to enter, and Official Rules
-- §4.2 points entrants at /giveaway/free-entry. This table is where those
-- entries land. It holds PII: first name, last name, email, ZIP.
--
-- ACCESS MODEL: SERVICE ROLE ONLY. RLS is enabled and NO policies are created,
-- so anon and authenticated can neither read nor write. Every insert goes
-- through POST /api/giveaway/free-entry, which uses the service-role client.
--
-- Granting anon INSERT would have been the obvious shape, and it would have
-- made the daily limit meaningless: the anon key ships in the client bundle, so
-- anyone could POST straight to /rest/v1/sweepstakes_entries and bypass every
-- server-side check. For a fairness control on a prize promotion, that matters.
--
-- Run in the Supabase SQL Editor, after 021. Applied via _recon/apply-to-dev.mjs.

CREATE TABLE IF NOT EXISTS sweepstakes_entries (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  first_name TEXT NOT NULL,
  last_name  TEXT NOT NULL,
  -- Stored normalized (trimmed + lowercased) by the route. The daily-limit
  -- index depends on that normalization being done before insert.
  email      TEXT NOT NULL,
  zip        TEXT NOT NULL,

  -- "Calendar day" per Rules §4.2, in CENTRAL time. A DFW promotion measured in
  -- UTC would hand anyone in Texas a second entry between 7pm and midnight.
  entry_date DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Chicago')::date),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- The daily limit, enforced by the DATABASE.
--
-- The route also checks, but a route-level check cannot win a race: two
-- submissions arriving together would both see "no entry today" and both
-- insert. This index makes the second one fail with 23505, which the route
-- translates into the friendly "you have already entered today" message.
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS sweepstakes_entries_email_day
  ON sweepstakes_entries (email, entry_date);

-- Audit reads: every entry in submission order.
CREATE INDEX IF NOT EXISTS sweepstakes_entries_created_idx
  ON sweepstakes_entries (created_at DESC);

-- ============================================================
-- RLS: on, with no policies. Deliberate.
--
-- Postgres denies by default when RLS is enabled and nothing grants access, so
-- this table is unreachable by anon and authenticated. service_role bypasses
-- RLS entirely, which is how the route writes and how the drawing is audited.
-- ============================================================
ALTER TABLE sweepstakes_entries ENABLE ROW LEVEL SECURITY;

-- Revoke Supabase's default blanket grants on new tables. RLS alone would stop
-- reads, but there is no reason for these roles to hold table privileges on a
-- PII table at all — same tightening applied to public_profiles in 020.
REVOKE ALL ON sweepstakes_entries FROM anon, authenticated;

COMMENT ON TABLE sweepstakes_entries IS
  'AMOE entries for the $500 Bat Giveaway. PII. Service-role access only: no '
  'RLS policies exist and table grants are revoked from anon/authenticated. '
  'Written by /api/giveaway/free-entry; read by /admin/giveaway for the drawing.';

NOTIFY pgrst, 'reload schema';
