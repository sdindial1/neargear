-- Session 12 — Founding Family + household profiles + waitlist.
-- Run in the Supabase SQL Editor.

-- ============================================================
-- Founding member flag
-- ============================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_founding_member BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS users_is_founding_member_idx
  ON users (is_founding_member)
  WHERE is_founding_member = true;

-- ============================================================
-- Founding spots counter (single-row table)
-- ============================================================
CREATE TABLE IF NOT EXISTS founding_spots (
  id INTEGER PRIMARY KEY DEFAULT 1,
  spots_claimed INTEGER NOT NULL DEFAULT 0,
  total_spots INTEGER NOT NULL DEFAULT 15,
  CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO founding_spots (id, spots_claimed, total_spots)
VALUES (1, 0, 15)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE founding_spots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read founding spots" ON founding_spots;
CREATE POLICY "Anyone can read founding spots"
  ON founding_spots FOR SELECT
  USING (true);

-- ============================================================
-- Household / spouse fields + family display name + active profile
-- ============================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS spouse_name    TEXT,
  ADD COLUMN IF NOT EXISTS spouse_phone   TEXT,
  ADD COLUMN IF NOT EXISTS spouse_email   TEXT,
  ADD COLUMN IF NOT EXISTS active_profile TEXT DEFAULT 'primary',
  ADD COLUMN IF NOT EXISTS family_name    TEXT;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_active_profile_check;
ALTER TABLE users
  ADD CONSTRAINT users_active_profile_check
  CHECK (active_profile IN ('primary', 'spouse'));

-- ============================================================
-- Waitlist
-- ============================================================
CREATE TABLE IF NOT EXISTS waitlist (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email      TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can join waitlist" ON waitlist;
CREATE POLICY "Anyone can join waitlist"
  ON waitlist FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- Atomic founding-spot claim (race-safe).
-- Uses row-level lock + same-transaction update + user flag flip.
-- Returns the new spots_claimed value, or NULL if no spots remain
-- or the user is already a founding member.
-- ============================================================
CREATE OR REPLACE FUNCTION claim_founding_spot(claimer_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_claimed INTEGER;
  current_total   INTEGER;
  already_member  BOOLEAN;
BEGIN
  SELECT is_founding_member INTO already_member
    FROM users WHERE id = claimer_id;
  IF already_member IS TRUE THEN
    RETURN NULL;
  END IF;

  SELECT spots_claimed, total_spots
    INTO current_claimed, current_total
    FROM founding_spots
    WHERE id = 1
    FOR UPDATE;

  IF current_claimed >= current_total THEN
    RETURN NULL;
  END IF;

  UPDATE founding_spots
     SET spots_claimed = current_claimed + 1
     WHERE id = 1;

  UPDATE users
     SET is_founding_member = true
     WHERE id = claimer_id;

  RETURN current_claimed + 1;
END;
$$;

REVOKE ALL ON FUNCTION claim_founding_spot(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_founding_spot(UUID) TO authenticated, service_role;
