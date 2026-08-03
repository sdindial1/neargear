-- Payments Phase 4: pre-release refunds + admin dispute resolution.
--
-- Phase 3 froze orders on cancel / no-show / dispute (orders.disputed_at) but
-- had nowhere to send them, so held funds sat at 'paid_held' forever. Phase 4
-- resolves them: a full refund to the buyer (item + Buyer Protection fee), or
-- a release to the seller.
--
-- SCOPE: PRE-RELEASE ONLY. Once funds have transferred to the seller, reversal
-- is manual via the Stripe dashboard -- refundOrder() hard-refuses those.
--
-- Run in the Supabase SQL Editor, after 015_release.sql.
-- PREREQUISITE: 008_strikes.sql must be applied first (it never was -- the
-- no-show and item-dispute flows write columns it creates).

-- ============================================================
-- 1. orders: refund columns
-- ============================================================
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS stripe_refund_id TEXT,
  ADD COLUMN IF NOT EXISTS refunded_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_reason    TEXT,
  ADD COLUMN IF NOT EXISTS refund_error     TEXT,
  ADD COLUMN IF NOT EXISTS refund_attempts  INTEGER NOT NULL DEFAULT 0,

  -- Persisted rather than re-derived from the PaymentIntent on every call.
  -- releaseOrder resolves it at runtime for source_transaction; refunds and any
  -- future reversal need it too.
  ADD COLUMN IF NOT EXISTS stripe_charge_id TEXT,

  -- WHY this order is frozen. disputed_at says "frozen"; this says what for,
  -- so the admin queue can explain itself without joining three tables.
  ADD COLUMN IF NOT EXISTS freeze_reason    TEXT,

  -- Admin resolution of a frozen order. Binary by design -- no partials.
  ADD COLUMN IF NOT EXISTS dispute_resolution  TEXT,
  ADD COLUMN IF NOT EXISTS dispute_resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispute_resolved_by UUID REFERENCES users(id);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_refund_reason_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_refund_reason_check CHECK (
    refund_reason IS NULL OR refund_reason IN (
      'cancelled',       -- buyer cancelled >24h out, or seller cancelled
      'seller_no_show',
      'buyer_no_show',
      'dispute_upheld'   -- admin sided with the buyer
    )
  );

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_freeze_reason_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_freeze_reason_check CHECK (
    freeze_reason IS NULL OR freeze_reason IN (
      'item_dispute',
      'no_show',
      'cancelled',
      'cancelled_late'   -- buyer cancelled inside 24h -> admin decides
    )
  );

-- Binary only. Partial refunds are deliberately not modelled (POST-LAUNCH).
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_dispute_resolution_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_dispute_resolution_check CHECK (
    dispute_resolution IS NULL OR dispute_resolution IN (
      'refund_buyer',
      'release_seller'
    )
  );

-- ============================================================
-- 2. orders.status: the refund lifecycle
--
-- 'refunding'      -- CAS-claimed, Stripe refund in flight. This is what makes
--                     refundOrder and releaseOrder mutually exclusive on one
--                     row: each claims only states the other cannot hold.
-- 'refund_failed'  -- attempts exhausted; funds still held, needs a human.
-- 'refunded'       -- already existed (mig 014), now actually reachable.
-- ============================================================
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_status_check CHECK (status IN (
    'pending',
    'paid_held',
    'releasing',
    'released',
    'release_failed',
    'refunding',       -- Phase 4
    'refunded',
    'refund_failed',   -- Phase 4
    'cancelled',
    'failed'
  ));

-- ============================================================
-- 3. Indexes
-- ============================================================
-- One Stripe refund id can never be recorded twice -- the database backstop
-- behind the CAS claim and the Stripe idempotency key.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_refund
  ON orders(stripe_refund_id)
  WHERE stripe_refund_id IS NOT NULL;

-- The admin review queue: frozen orders still holding funds. Deliberately
-- order-driven rather than keyed on meetups.status, so disputes, late cancels
-- and any future freeze reason land in one place.
CREATE INDEX IF NOT EXISTS idx_orders_review_queue
  ON orders(disputed_at DESC)
  WHERE disputed_at IS NOT NULL
    AND status IN ('paid_held', 'release_failed');

-- Post-release cases needing MANUAL Stripe reversal: money already gone, then
-- reported. refundOrder refuses these; this index makes them visible.
CREATE INDEX IF NOT EXISTS idx_orders_manual_reversal
  ON orders(disputed_at DESC)
  WHERE disputed_at IS NOT NULL AND status = 'released';

-- ============================================================
-- 4. RLS
--
-- No policy changes. The mig-014 participant SELECT policy already covers the
-- new columns. Every Phase 4 write (refundOrder, the auto-refund wiring, admin
-- resolution) goes through the service-role client. No new anon-writable
-- surface, and refunds are never client-initiated.
-- ============================================================
