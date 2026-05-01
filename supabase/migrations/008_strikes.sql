-- Session 11: No-show, item disputes, strike system
-- - strikes: per-incident records with type + issuer
-- - users.{strike_count, suspension_ends_at, suspended_permanently}
-- - meetups.{no_show_reported_*, item_dispute_*}
-- - meetups.status enum: + 'item_dispute'

-- Drop old strikes table if it has the legacy "reason" schema; we want a
-- richer record going forward.
DROP TABLE IF EXISTS strikes CASCADE;

CREATE TABLE strikes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  meetup_id UUID REFERENCES meetups(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  -- buyer_no_show | seller_no_show | item_not_as_described
  -- | late_cancel_buyer | late_cancel_seller
  issued_by TEXT NOT NULL,
  -- buyer | seller | system | admin
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX strikes_user_id_idx ON strikes(user_id, created_at DESC);

ALTER TABLE strikes ENABLE ROW LEVEL SECURITY;

-- Users can read their own strikes
DROP POLICY IF EXISTS "Users see own strikes" ON strikes;
CREATE POLICY "Users see own strikes"
  ON strikes FOR SELECT
  USING (auth.uid() = user_id);

-- Inserts go through the service role only
DROP POLICY IF EXISTS "No client inserts to strikes" ON strikes;
CREATE POLICY "No client inserts to strikes"
  ON strikes FOR INSERT
  WITH CHECK (false);

-- Suspension fields on users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS strike_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suspension_ends_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS suspended_permanently BOOLEAN DEFAULT false;

-- No-show + item dispute fields on meetups
ALTER TABLE meetups
  ADD COLUMN IF NOT EXISTS no_show_reported_by TEXT,
  ADD COLUMN IF NOT EXISTS no_show_reported_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS item_dispute_reported_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS item_dispute_reason TEXT,
  ADD COLUMN IF NOT EXISTS item_dispute_notes TEXT,
  ADD COLUMN IF NOT EXISTS no_show_prompt_sent_at TIMESTAMP WITH TIME ZONE;

-- Meetups status enum expansion
ALTER TABLE meetups
  DROP CONSTRAINT IF EXISTS meetups_status_check;
ALTER TABLE meetups
  ADD CONSTRAINT meetups_status_check
  CHECK (status IN (
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
    'disputed',
    'item_dispute'
  ));
