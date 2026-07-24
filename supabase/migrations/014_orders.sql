-- Payments Phase 2: buyer checkout + full-payment capture.
-- An `orders` row is created when the buyer initiates checkout on an ACCEPTED
-- meetup, and flipped to 'paid_held' by the Stripe webhook once the full amount
-- is captured into NearGear's platform balance. Transfers to the seller,
-- confirmation/release, and refunds are LATER phases (3 & 4).
--
-- Distinct from `transactions` (mig 005), which is created at meetup COMPLETION.
-- `orders` sits earlier in the lifecycle (captured-at-checkout, held on platform).
-- Run in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Links. SET NULL (not CASCADE) so financial records survive if a source row
  -- is removed — accounting history should not vanish.
  meetup_id UUID REFERENCES meetups(id) ON DELETE SET NULL,
  listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,
  buyer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  seller_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Money — all integer cents. Snapshotted at checkout from the agreed offer.
  item_price_cents INTEGER NOT NULL,          -- agreed item price (meetup.offered_price)
  buyer_fee_cents INTEGER NOT NULL,           -- 10% Buyer Protection fee, added on top
  seller_fee_cents INTEGER NOT NULL,          -- 10% seller fee (0 for founding), deducted at payout (Phase 3)
  gross_captured_cents INTEGER NOT NULL DEFAULT 0, -- amount actually captured (item + buyer fee); set on payment
  currency TEXT NOT NULL DEFAULT 'usd',

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',    -- Checkout Session created, not yet paid
    'paid_held',  -- full amount captured, held on platform (Phase 2 terminal state)
    'released',   -- transferred to seller (Phase 3)
    'refunded',   -- refunded to buyer (Phase 4)
    'cancelled',  -- order voided before payment
    'failed'      -- payment failed/expired
  )),

  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

-- At most one captured order per meetup (guards against double payment).
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_meetup_paid
  ON orders(meetup_id)
  WHERE status = 'paid_held' AND meetup_id IS NOT NULL;

-- Fast webhook lookups by Stripe ids.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_checkout_session
  ON orders(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_payment_intent
  ON orders(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_buyer  ON orders(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_meetup ON orders(meetup_id);

-- ============================================================
-- RLS — mirrors `transactions` (mig 005). Participants can read their own
-- orders; the checkout route and webhook write via the service-role client
-- (bypasses RLS). The INSERT policy is defense-in-depth for any authed write.
-- ============================================================
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view their orders" ON orders;
CREATE POLICY "Participants can view their orders"
  ON orders FOR SELECT
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

DROP POLICY IF EXISTS "Buyer can insert their orders" ON orders;
CREATE POLICY "Buyer can insert their orders"
  ON orders FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = buyer_id);
