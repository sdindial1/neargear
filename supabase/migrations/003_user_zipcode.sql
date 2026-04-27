-- Session 4 prep — zipcode column on users for proximity matching.
-- Run in the Supabase SQL Editor.

ALTER TABLE users ADD COLUMN IF NOT EXISTS zipcode TEXT;

-- Optional sanity check — 5 digit US zipcodes
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_zipcode_format_check;
ALTER TABLE users
  ADD CONSTRAINT users_zipcode_format_check CHECK (
    zipcode IS NULL OR zipcode ~ '^[0-9]{5}$'
  );

CREATE INDEX IF NOT EXISTS users_zipcode_idx ON users (zipcode);
