-- Payments Phase 4 — reconcile orders columns with what the code references.
--
-- Migration 016 was applied piecemeal against the dev database, and the dev
-- database separately carried three columns that appear in NO migration file:
-- refund_id, refund_amount_cents, refund_initiated_by. This migration makes the
-- files and the code agree, once.
--
-- NAMING RESOLUTION: the live DB had `refund_id`; all code and 016 use
-- `stripe_refund_id`, which matches every other Stripe identifier on this table
-- (stripe_payment_intent_id, stripe_charge_id, stripe_transfer_id,
-- stripe_checkout_session_id). `stripe_refund_id` wins; `refund_id` is renamed
-- rather than duplicated, so one concept keeps exactly one column.
--
-- Safe to run against a database where 016 fully applied, partially applied, or
-- never ran.
--
-- Run in the Supabase SQL Editor. Ends with a PostgREST cache reload.

-- ============================================================
-- 1. Rename refund_id -> stripe_refund_id, only if that is the actual state.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'orders' AND column_name = 'refund_id'
      )
     AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'orders' AND column_name = 'stripe_refund_id'
      )
  THEN
    ALTER TABLE orders RENAME COLUMN refund_id TO stripe_refund_id;
    RAISE NOTICE 'renamed orders.refund_id -> orders.stripe_refund_id';
  END IF;
END $$;

-- ============================================================
-- 2. Every column the Phase 4 code references that may still be absent.
--    Includes 016's full set so this works standalone.
-- ============================================================
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS stripe_refund_id    TEXT,
  ADD COLUMN IF NOT EXISTS refunded_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_reason       TEXT,
  ADD COLUMN IF NOT EXISTS refund_error        TEXT,
  ADD COLUMN IF NOT EXISTS refund_attempts     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_charge_id    TEXT,
  ADD COLUMN IF NOT EXISTS freeze_reason       TEXT,
  ADD COLUMN IF NOT EXISTS dispute_resolution  TEXT,
  ADD COLUMN IF NOT EXISTS dispute_resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispute_resolved_by UUID REFERENCES users(id),
  -- Present in the dev DB with no backing migration. Declared here so a fresh
  -- production database matches dev. refund_amount_cents is populated by
  -- refundOrder; refund_initiated_by is currently unused and is a candidate for
  -- removal in the reconciliation pass (POST-LAUNCH item 1).
  ADD COLUMN IF NOT EXISTS refund_amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS refund_initiated_by UUID REFERENCES users(id);

-- ============================================================
-- 3. Constraints
-- ============================================================
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_refund_reason_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_refund_reason_check CHECK (
    refund_reason IS NULL OR refund_reason IN (
      'cancelled', 'seller_no_show', 'buyer_no_show', 'dispute_upheld'
    )
  );

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_freeze_reason_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_freeze_reason_check CHECK (
    freeze_reason IS NULL OR freeze_reason IN (
      'item_dispute', 'no_show', 'cancelled', 'cancelled_late'
    )
  );

-- Binary only. Partial refunds are deliberately not modelled (POST-LAUNCH).
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_dispute_resolution_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_dispute_resolution_check CHECK (
    dispute_resolution IS NULL OR dispute_resolution IN (
      'refund_buyer', 'release_seller'
    )
  );

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_status_check CHECK (status IN (
    'pending',
    'paid_held',
    'releasing',
    'released',
    'release_failed',
    'refunding',
    'refunded',
    'refund_failed',
    'cancelled',
    'failed'
  ));

-- ============================================================
-- 4. Indexes
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_refund
  ON orders(stripe_refund_id)
  WHERE stripe_refund_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_review_queue
  ON orders(disputed_at DESC)
  WHERE disputed_at IS NOT NULL
    AND status IN ('paid_held', 'release_failed');

CREATE INDEX IF NOT EXISTS idx_orders_manual_reversal
  ON orders(disputed_at DESC)
  WHERE disputed_at IS NOT NULL AND status = 'released';

-- ============================================================
-- 5. Make PostgREST see all of it at once.
-- ============================================================
NOTIFY pgrst, 'reload schema';
