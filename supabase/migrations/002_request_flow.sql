-- Session 3 — request-to-buy flow
-- Adds window/offer columns to meetups, expands status enum, changes default.
-- Run in the Supabase SQL Editor.

ALTER TABLE meetups
  ADD COLUMN IF NOT EXISTS meetup_window_start TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS meetup_window_end   TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS offered_price       INTEGER,
  ADD COLUMN IF NOT EXISTS offer_type          TEXT;

-- Expand status values. Drop the old check, re-add with the full set.
ALTER TABLE meetups DROP CONSTRAINT IF EXISTS meetups_status_check;
ALTER TABLE meetups
  ADD CONSTRAINT meetups_status_check CHECK (status IN (
    'requested',
    'countered',
    'scheduled',
    'deposit_pending',
    'buyer_confirmed',
    'seller_confirmed',
    'completed',
    'cancelled_buyer',
    'cancelled_seller',
    'cancelled_auto',
    'no_show_buyer',
    'no_show_seller',
    'disputed'
  ));

-- offer_type check (only for rows where we record one)
ALTER TABLE meetups DROP CONSTRAINT IF EXISTS meetups_offer_type_check;
ALTER TABLE meetups
  ADD CONSTRAINT meetups_offer_type_check CHECK (
    offer_type IS NULL OR offer_type IN ('full_price', 'minus_10', 'minus_15', 'custom')
  );

-- Default status for new rows is now 'requested'.
ALTER TABLE meetups ALTER COLUMN status SET DEFAULT 'requested';

-- Helpful indexes for the profile/meetups tab queries.
CREATE INDEX IF NOT EXISTS meetups_buyer_status_idx  ON meetups (buyer_id, status);
CREATE INDEX IF NOT EXISTS meetups_seller_status_idx ON meetups (seller_id, status);
