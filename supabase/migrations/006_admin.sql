-- Session 6 — admin dashboard schema additions.
-- Run in the Supabase SQL Editor.

-- ============================================================
-- users.account_status — admin moderation flag
-- ============================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'active';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_account_status_check;
ALTER TABLE users
  ADD CONSTRAINT users_account_status_check CHECK (
    account_status IN ('active', 'flagged', 'banned')
  );

CREATE INDEX IF NOT EXISTS users_account_status_idx
  ON users (account_status);

-- ============================================================
-- listings.status — re-state the constraint for documentation
-- (the original schema already includes 'removed', this is a no-op
--  in most envs but keeps migrations self-describing)
-- ============================================================
ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_status_check;
ALTER TABLE listings
  ADD CONSTRAINT listings_status_check CHECK (
    status IN ('active', 'pending', 'sold', 'removed')
  );
