-- ============================================================
-- 029: Normalise listings.sport to the canonical casing
--
-- LIVE BUG, VISIBLE TO PAID TRAFFIC. /marketplace filters with an exact
-- equality on sport (`.eq("sport", sportFilter)`) against the SPORTS constant,
-- which is title case. The 25 seed listings were written by
-- scripts/seed-demo-data.ts in lowercase ('baseball', 'golf'), so they match no
-- filter pill at all. Measured before this migration:
--
--   Baseball 16 · Softball 6 · Soccer 3 · everything else 0
--
-- Nine of the thirteen pills returned an empty grid while 25 listings sat in
-- the database that should have filled five of them. Ads point at /giveaway,
-- whose whole pitch is that this is a live marketplace, so a seller who clicks
-- Football and sees "No listings found" is being shown the opposite.
--
-- WHY NORMALISE THE DATA RATHER THAN THE QUERY: a case-insensitive read
-- (`ilike`) would fix the symptom in one query and leave the mixed-case data
-- for every future query to remember. Sport is a closed set; the database
-- should hold canonical values. The read path stays a plain equality, which is
-- also the only form the index can serve.
--
-- Explicit mapping rather than initcap(): initcap is not correct for every
-- member of the set (it would render 'Track & Field' by luck, not by rule) and
-- would silently invent a title-cased value for anything outside it. An
-- explicit map fails loudly instead, and the post-check below proves it.
--
-- 'golf' is normalised to 'Golf' here AND added to SPORTS in the same change —
-- the value was never in the constant, so those five listings were unreachable
-- by any filter regardless of casing.
--
-- Purely a data migration: no schema change, no policy change, no visibility
-- change to the unfiltered marketplace. The active count is 50 before and
-- after; what changes is which listings a FILTER can reach.
-- ============================================================

UPDATE listings SET sport = 'Baseball'   WHERE sport = 'baseball';
UPDATE listings SET sport = 'Softball'   WHERE sport = 'softball';
UPDATE listings SET sport = 'Soccer'     WHERE sport = 'soccer';
UPDATE listings SET sport = 'Basketball' WHERE sport = 'basketball';
UPDATE listings SET sport = 'Football'   WHERE sport = 'football';
UPDATE listings SET sport = 'Lacrosse'   WHERE sport = 'lacrosse';
UPDATE listings SET sport = 'Hockey'     WHERE sport = 'hockey';
UPDATE listings SET sport = 'Volleyball' WHERE sport = 'volleyball';
UPDATE listings SET sport = 'Tennis'     WHERE sport = 'tennis';
UPDATE listings SET sport = 'Swimming'   WHERE sport = 'swimming';
UPDATE listings SET sport = 'Wrestling'  WHERE sport = 'wrestling';
UPDATE listings SET sport = 'Golf'       WHERE sport = 'golf';
UPDATE listings SET sport = 'Track & Field'
  WHERE lower(sport) IN ('track & field', 'track and field', 'track');
UPDATE listings SET sport = 'Other'      WHERE sport = 'other';

-- Post-check. Any value left outside the canonical set means the map above is
-- incomplete and a filter would still return an empty grid for it. Failing the
-- migration is the right outcome: a silent partial fix is what produced this.
DO $$
DECLARE
  stragglers TEXT;
BEGIN
  SELECT string_agg(DISTINCT sport, ', ')
    INTO stragglers
    FROM listings
   WHERE sport IS NOT NULL
     AND sport NOT IN ('Baseball','Softball','Soccer','Basketball','Football',
                       'Lacrosse','Hockey','Volleyball','Tennis','Swimming',
                       'Track & Field','Wrestling','Golf','Other');
  IF stragglers IS NOT NULL THEN
    RAISE EXCEPTION
      'sport values outside the canonical set remain: %. Add them to SPORTS in '
      'src/lib/constants.ts and to the mapping above.', stragglers;
  END IF;
END $$;

-- Sport is the most-used filter on /marketplace and had no index of its own.
CREATE INDEX IF NOT EXISTS listings_active_sport_idx
  ON listings (sport, created_at DESC)
  WHERE status = 'active';

NOTIFY pgrst, 'reload schema';
