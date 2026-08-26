-- ============================================================
-- 033: Sweepstakes eligibility (Official Rules §2)
--
-- §2: "Employees, officers, and members of Sponsor, and their immediate family
-- members (spouse, parent, child, sibling) and household members, are not
-- eligible." Every listing entry currently in the Promotion belongs to a
-- founder, so the eligible pool is zero while ads actively promote the
-- giveaway. That figure is the honest measure of whether the giveaway is
-- acquiring anyone, and our own entries have been masking it.
--
-- TWO COLUMNS, NOT ONE, BECAUSE THERE ARE TWO KINDS OF ENTRY AND THEY HAVE
-- DIFFERENT IDENTITY ANCHORS.
--
--   Listing entries (§4.1) are NOT STORED ANYWHERE. They are derived at query
--   time from listings that are active and inside the Promotion Period, grouped
--   by seller. There is no row to flag. Eligibility is a property of the PERSON,
--   so it goes on users.
--
--   AMOE entries (§4.2) ARE rows, in sweepstakes_entries, keyed by an email
--   address that may belong to no account at all. Eligibility is a property of
--   the ROW, so it goes there.
--
-- Putting a flag only on sweepstakes_entries — the intuitive move, since it is
-- the table with "sweepstakes" in the name — would have marked the single AMOE
-- row and left all four founder listing entries eligible. The table that sounds
-- like it holds the entries holds one of the two kinds.
--
-- NOTHING IS DELETED. Both default TRUE and ineligible rows stay exactly where
-- they are. §7 requires the winner to be drawn from all ELIGIBLE entries, and
-- §5 lets Sponsor disqualify — neither is served by making disqualified entries
-- disappear. An audit that cannot show what was excluded, and why, is not an
-- audit.
--
-- WHO IS MARKED IS NOT IN THIS FILE. The founder account list contains personal
-- addresses and is an operational judgement that will change (a new admin, a
-- family member creating an account). It is applied by _recon/mark-ineligible.mjs
-- rather than embedded in schema history where it would replay on every rebuild.
-- The schema is the mechanism; the list is data.
-- ============================================================

-- Listing entries: eligibility follows the seller.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS sweepstakes_eligible BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS sweepstakes_ineligible_reason TEXT;

COMMENT ON COLUMN users.sweepstakes_eligible IS
  'Official Rules §2. FALSE for Sponsor personnel and Sponsor-controlled '
  'accounts. Listing entries are derived from listings grouped by seller, so '
  'this is what makes a listing entry (in)eligible. Never deletes anything.';

-- AMOE entries: eligibility follows the row, since the entrant may have no
-- account to hang it on.
ALTER TABLE sweepstakes_entries
  ADD COLUMN IF NOT EXISTS eligible BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ineligible_reason TEXT;

COMMENT ON COLUMN sweepstakes_entries.eligible IS
  'Official Rules §2/§5. FALSE excludes this AMOE entry from the drawing pool '
  'while preserving it as an audit record.';

-- The drawing and the admin audit both filter on eligibility; the counts are
-- also read on every /giveaway page render.
CREATE INDEX IF NOT EXISTS users_sweepstakes_eligible_idx
  ON users (sweepstakes_eligible)
  WHERE sweepstakes_eligible = FALSE;

NOTIFY pgrst, 'reload schema';
