-- ============================================================
-- 028: Label listing provenance (seed vs organic)
--
-- PURELY ADDITIVE AND VISIBILITY-NEUTRAL. Two columns and a backfill. No
-- policy, no view, no index that any read path consults today. /marketplace,
-- search and the category filters all key on status = 'active' and are
-- untouched: the same 50 active listings render before and after.
--
-- WHY: the seed listings stay for now (ads are live, pointing at /giveaway, and
-- inventory depth is a seller-side signal). They need to be retired one-for-one
-- as real listings arrive rather than purged in one go, and that is only
-- possible if they can be named durably. Today the only way to tell them apart
-- is to re-derive the rule every time, which is exactly how a "temporary"
-- classification becomes permanently ambiguous.
--
-- THE DISCRIMINATOR: seller account. The 25 seed listings belong to the five
-- demo sellers created by scripts/seed-demo-data.ts, whose emails match
-- 'demo.%@neargear.com' (note: NOT the hyphenated near-gear.com brand domain --
-- these accounts are unreachable and nobody can sign into them).
--
-- Three further signals agree with that rule on exactly the same 25 rows, with
-- zero disagreement in either direction:
--   * sport is stored lowercase ('baseball', 'golf') -- the seed script writes
--     it that way, the app writes title case
--   * created_at clusters inside a 3.2-second window on 2026-05-21 20:59:15Z
--   * every seed listing has exactly one photo; every real one has 2-4
-- The email rule is the one encoded here because it is the causal fact; the
-- others are its fingerprints and could drift.
--
-- TWO COLUMNS, NOT ONE, because they answer different questions:
--   source        provenance. A fact about where the row came from. Immutable.
--   retire_early  intent. A policy decision that can be set or cleared at any
--                 time, including on an organic listing.
-- Collapsing them into one enum would mean a near-duplicate real listing had to
-- be mislabelled as 'seed' to be queued for retirement, which would corrupt the
-- count that the phase-out trigger depends on.
--
-- DEFAULT 'organic' means listings created after this migration are labelled
-- correctly with no code change, which is why nothing in src/ needs to read or
-- write these columns yet.
--
-- FOOTGUN: re-running scripts/seed-demo-data.ts would now create listings
-- labelled 'organic', silently inflating the real-listing count that gates the
-- phase-out. The script is idempotent and should never need re-running; if it
-- ever does, set source='seed' on the rows it creates.
-- ============================================================

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS source       TEXT    NOT NULL DEFAULT 'organic',
  ADD COLUMN IF NOT EXISTS retire_early BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_source_check;
ALTER TABLE listings ADD CONSTRAINT listings_source_check
  CHECK (source IN ('seed', 'organic'));

COMMENT ON COLUMN listings.source IS
  'Provenance. seed = created by scripts/seed-demo-data.ts under a demo.%@neargear.com '
  'account nobody can sign into. organic = posted by a real account. Affects no '
  'visibility; used to retire seed inventory as real listings arrive.';
COMMENT ON COLUMN listings.retire_early IS
  'Queued for retirement ahead of the normal order, independently of source. Set '
  'on organic listings that should go early (e.g. a near-duplicate of the same item).';

-- ============================================================
-- Backfill. Joined on the seller account, not on any property of the listing
-- itself -- a title or photo-count rule would silently capture a real listing
-- that happened to look similar.
-- ============================================================
UPDATE listings l
   SET source = 'seed'
  FROM users u
 WHERE u.id = l.seller_id
   AND u.email LIKE 'demo.%@neargear.com';

-- The $55 Easton Quantum is a REAL listing from a real account, and a near
-- duplicate of the $65 one by the same person. Not seed -- it stays organic and
-- counts as real -- but it should go before any genuinely distinct listing.
UPDATE listings
   SET retire_early = TRUE
 WHERE id = '11962adc-8cd5-4383-a4a3-154cd1505c2d';

-- Retirement queries scan seed rows only; the table is otherwise mostly organic.
CREATE INDEX IF NOT EXISTS listings_source_seed_idx
  ON listings (source, created_at)
  WHERE source = 'seed';

NOTIFY pgrst, 'reload schema';
