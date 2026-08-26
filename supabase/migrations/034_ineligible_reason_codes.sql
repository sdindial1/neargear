-- ============================================================
-- 034: A constrained vocabulary for sweepstakes ineligibility
--
-- 033 gave both eligibility flags a free-text reason and the marking script
-- wrote prose into it ("Rules §2 — Sponsor personnel"). Prose cannot be counted.
-- The question an audit actually gets asked is "how many entries were excluded,
-- on what ground, and can you show it" — and answering that from a LIKE query
-- over hand-typed strings is not an answer.
--
-- §2 has FOUR distinct grounds and they are not interchangeable. Sponsor
-- personnel is a fact we hold. Immediate family and household members are facts
-- only Shaun can supply — they are NOT derivable from the database, and this
-- migration deliberately does not try. Shared surnames and shared addresses are
-- not evidence of a relationship; inferring one would put a real entrant out of
-- a $500 drawing on a guess.
--
-- So the codes exist and go unused until a human names people. An unpopulated
-- category that is visible is honest; coverage implied by silence is not.
--
--   sponsor_personnel   §2 — employees, officers, members of Sponsor
--   sponsor_family      §2 — immediate family (spouse, parent, child, sibling)
--   sponsor_household   §2 — household members
--   sponsor_controlled  §2 — accounts Sponsor created and controls (demo data)
--   residency           §2 — not a legal resident of the State of Texas
--   age                 §2 — under 18 at time of entry
--   rules_violation     §5 — fake/duplicate listings, multiple accounts, bots
--
-- NOTE ON residency: the Rules say "State of Texas", NOT the DFW metro. A ZIP
-- outside DFW but inside Texas is eligible and must not be marked with this
-- code. See the lawyer list in POST-LAUNCH.md — statewide eligibility sits
-- awkwardly against §7's DFW-only prize fulfilment, but that is a drafting
-- question, not a reason to exclude an entrant who satisfies the Rules as
-- written.
-- ============================================================

-- Re-map the prose written by 033's marking script.
UPDATE users
   SET sweepstakes_ineligible_reason = 'sponsor_personnel'
 WHERE sweepstakes_ineligible_reason LIKE '%Sponsor personnel%';
UPDATE users
   SET sweepstakes_ineligible_reason = 'sponsor_controlled'
 WHERE sweepstakes_ineligible_reason LIKE '%demo account%';
UPDATE sweepstakes_entries
   SET ineligible_reason = 'sponsor_personnel'
 WHERE ineligible_reason LIKE '%Sponsor personnel%';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_sweepstakes_ineligible_reason_check;
ALTER TABLE users ADD CONSTRAINT users_sweepstakes_ineligible_reason_check
  CHECK (
    sweepstakes_ineligible_reason IS NULL
    OR sweepstakes_ineligible_reason IN (
      'sponsor_personnel', 'sponsor_family', 'sponsor_household',
      'sponsor_controlled', 'residency', 'age', 'rules_violation'
    )
  );

ALTER TABLE sweepstakes_entries DROP CONSTRAINT IF EXISTS sweepstakes_entries_ineligible_reason_check;
ALTER TABLE sweepstakes_entries ADD CONSTRAINT sweepstakes_entries_ineligible_reason_check
  CHECK (
    ineligible_reason IS NULL
    OR ineligible_reason IN (
      'sponsor_personnel', 'sponsor_family', 'sponsor_household',
      'sponsor_controlled', 'residency', 'age', 'rules_violation'
    )
  );

-- A reason without an exclusion, or an exclusion without a reason, is a
-- half-finished decision. Both are rejected so the audit cannot drift into
-- "excluded, nobody remembers why".
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_sweepstakes_reason_pairing_check;
ALTER TABLE users ADD CONSTRAINT users_sweepstakes_reason_pairing_check
  CHECK (sweepstakes_eligible = (sweepstakes_ineligible_reason IS NULL));

ALTER TABLE sweepstakes_entries DROP CONSTRAINT IF EXISTS sweepstakes_entries_reason_pairing_check;
ALTER TABLE sweepstakes_entries ADD CONSTRAINT sweepstakes_entries_reason_pairing_check
  CHECK (eligible = (ineligible_reason IS NULL));

COMMENT ON COLUMN users.sweepstakes_ineligible_reason IS
  'Official Rules ground for exclusion, as a code. sponsor_family and '
  'sponsor_household exist but are unpopulated: only a human can name those '
  'people, and relationships are never inferred from surnames or addresses.';

NOTIFY pgrst, 'reload schema';
