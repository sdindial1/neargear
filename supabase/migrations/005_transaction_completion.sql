-- Session 5 — transaction completion flow.
-- Run in the Supabase SQL Editor.

-- ============================================================
-- listings.retail_price (cents) — used by buyer celebration savings line
-- ============================================================
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS retail_price INTEGER;

-- ============================================================
-- meetups completion columns + auto_completed flag
-- ============================================================
ALTER TABLE meetups
  ADD COLUMN IF NOT EXISTS buyer_completed_at  TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS seller_completed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS auto_completed      BOOLEAN DEFAULT false;
-- completed_at already exists from the original schema.

-- ============================================================
-- meetups status — add 'payment_processing'
-- ('buyer_confirmed', 'seller_confirmed', 'completed' already in the enum)
-- ============================================================
ALTER TABLE meetups DROP CONSTRAINT IF EXISTS meetups_status_check;
ALTER TABLE meetups
  ADD CONSTRAINT meetups_status_check CHECK (status IN (
    'requested',
    'countered',
    'scheduled',
    'deposit_pending',
    'buyer_confirmed',
    'seller_confirmed',
    'payment_processing',
    'completed',
    'cancelled_buyer',
    'cancelled_seller',
    'cancelled_auto',
    'no_show_buyer',
    'no_show_seller',
    'disputed'
  ));

-- ============================================================
-- transactions table
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  meetup_id UUID REFERENCES meetups(id) ON DELETE CASCADE,
  listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,
  buyer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  seller_id UUID REFERENCES users(id) ON DELETE SET NULL,
  gross_amount INTEGER NOT NULL,
  platform_fee INTEGER NOT NULL,
  net_amount INTEGER NOT NULL,
  retail_price INTEGER,
  auto_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view their transactions" ON transactions;
CREATE POLICY "Participants can view their transactions"
  ON transactions FOR SELECT
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

DROP POLICY IF EXISTS "Participants can insert their transactions" ON transactions;
CREATE POLICY "Participants can insert their transactions"
  ON transactions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND (auth.uid() = buyer_id OR auth.uid() = seller_id));

CREATE INDEX IF NOT EXISTS transactions_buyer_idx  ON transactions (buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_seller_idx ON transactions (seller_id, created_at DESC);
