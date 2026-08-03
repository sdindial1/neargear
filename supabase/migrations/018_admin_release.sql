-- Payments Phase 4 Step 4: admin dispute resolution.
--
-- Releasing to the seller from the admin queue is a fourth way an order can be
-- released, and it is not any of the three ladder rungs -- it is a human
-- decision, not a timer. Recording it as 'buyer_confirmed' would be a lie in
-- the one record we would reach for when auditing where money went.
--
-- No other schema is needed for Step 4: dispute_resolution, dispute_resolved_at
-- and dispute_resolved_by already exist (mig 016/017).
--
-- Run in the Supabase SQL Editor, after 017.

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_release_reason_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_release_reason_check CHECK (
    release_reason IS NULL OR release_reason IN (
      'buyer_confirmed',  -- rung 1
      'seller_24h',       -- rung 2
      'backstop_7d',      -- rung 3
      'admin_release'     -- rung 4 resolved in favour of the seller
    )
  );

NOTIFY pgrst, 'reload schema';
