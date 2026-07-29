-- Payments Phase 3: fund release + transfer to seller.
--
-- Phase 2 left orders at 'paid_held' (full amount captured, held on NearGear's
-- platform balance). Phase 3 transfers the seller's cut to their connected
-- account when the handoff is confirmed, via the separate charges-and-transfers
-- model (the charge already happened; this is the transfer leg).
--
-- RELEASE LADDER (all releases go through releaseOrder() in src/lib/orders/release.ts):
--   1. Buyer confirms receipt              -> immediate release
--   2. Seller confirms, buyer silent 24h   -> release (daily cron sweep)
--   3. Neither confirms, 7d from window    -> release (daily cron sweep)
--   4. Dispute flag on the order           -> freezes all release (Phase 4 resolves)
-- Absent a dispute, funds always end with the seller.
--
-- This migration is ADDITIVE except for two deliberate changes:
--   - orders.status CHECK gains 'releasing' and 'release_failed'
--   - meetups.deposit_amount drops NOT NULL (deposit model retired in Phase 2)
-- Plus a new trigger enforcing the core money-integrity invariant (bottom).
--
-- Run in the Supabase SQL Editor, after 014_orders.sql.

-- ============================================================
-- 1. orders: confirmation, release, and dispute-freeze columns
-- ============================================================
ALTER TABLE orders
  -- Confirmation (mirrors meetups.buyer_completed_at/seller_completed_at, but
  -- on the ORDER, which is the money record and the only thing release trusts).
  ADD COLUMN IF NOT EXISTS buyer_confirmed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS seller_confirmed_at  TIMESTAMPTZ,
  -- Rung 2's clock. Stamped by the seller-confirm route when it notifies the
  -- buyer, NOT by the cron -- with a daily cron, making the sweep send the
  -- notification would stretch rung 2 to 48-72h instead of 24-48h.
  ADD COLUMN IF NOT EXISTS buyer_notified_at    TIMESTAMPTZ,

  -- Release.
  ADD COLUMN IF NOT EXISTS released_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS release_reason       TEXT,
  ADD COLUMN IF NOT EXISTS stripe_transfer_id   TEXT,

  -- Dispute freeze (Phase 3 sets it; Phase 4 resolves it). A non-null value
  -- makes the order unclaimable by releaseOrder's CAS -- see section 4.
  ADD COLUMN IF NOT EXISTS disputed_at          TIMESTAMPTZ,

  -- Failure bookkeeping. A failed transfer returns the order to 'paid_held' so
  -- the next daily sweep retries it (a transient Stripe balance_insufficient
  -- must be a delay, not a stranded payout). Attempts are capped in the sweep.
  ADD COLUMN IF NOT EXISTS transfer_error       TEXT,
  ADD COLUMN IF NOT EXISTS transfer_attempts    INTEGER NOT NULL DEFAULT 0;

-- Only the three ladder outcomes are valid reasons.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_release_reason_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_release_reason_check CHECK (
    release_reason IS NULL OR release_reason IN (
      'buyer_confirmed',  -- rung 1
      'seller_24h',       -- rung 2
      'backstop_7d'       -- rung 3
    )
  );

-- ============================================================
-- 2. orders.status: add the in-flight and failure states
--
-- 'releasing'      -- CAS-claimed, Stripe transfer in flight. This is what makes
--                     a concurrent cron pass and a buyer tap unable to both
--                     reach the Stripe call for one order.
-- 'release_failed' -- transfer failed repeatedly (attempts cap hit). NOT a
--                     terminal accounting state -- funds are still held on the
--                     platform; it means "needs a human look".
-- ============================================================
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_status_check CHECK (status IN (
    'pending',         -- Checkout Session created, not yet paid
    'paid_held',       -- full amount captured, held on platform
    'releasing',       -- transfer in flight (Phase 3)
    'released',        -- transferred to seller (Phase 3)
    'release_failed',  -- transfer failed, attempts exhausted (Phase 3)
    'refunded',        -- refunded to buyer (Phase 4)
    'cancelled',       -- order voided before payment
    'failed'           -- payment failed/expired
  ));

-- ============================================================
-- 3. Idempotency + sweep indexes
-- ============================================================
-- Hard guarantee: one Stripe transfer id can never be recorded twice. This is
-- the database-level backstop behind the CAS claim and the Stripe idempotency
-- key -- three independent defences against a double payout.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_transfer
  ON orders(stripe_transfer_id)
  WHERE stripe_transfer_id IS NOT NULL;

-- Daily sweep scan: releasable candidates only.
CREATE INDEX IF NOT EXISTS idx_orders_release_sweep
  ON orders(status, seller_confirmed_at)
  WHERE status = 'paid_held' AND disputed_at IS NULL;

-- ============================================================
-- 4. transactions: becomes a projection of the order
--
-- `transactions` stays the user-facing ledger row (read by /profile/wallet,
-- /profile/transactions, /profile/transactions/[id], /admin, the
-- transaction_complete notification, and the partner CSV export) -- but from
-- Phase 3 it is WRITTEN only by releaseOrder(), server-side, with cents copied
-- from the order. No more browser-computed fees.
--
-- Column meanings under the flat model:
--   gross_amount = orders.item_price_cents
--   platform_fee = orders.seller_fee_cents   (0 for founding sellers)
--   net_amount   = item_price_cents - seller_fee_cents  (the seller's payout)
-- The buyer fee is platform revenue and lives only on the order; join via
-- order_id for the full breakdown.
-- ============================================================
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_order ON transactions(order_id);

-- One ledger row per meetup, enforced. Guards the old client/cron double-write
-- race permanently. Verified safe to apply: transactions is empty as of
-- 2026-07-29 (0 rows, 0 duplicate meetup_ids).
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_meetup
  ON transactions(meetup_id)
  WHERE meetup_id IS NOT NULL;

-- ============================================================
-- 5. Deposit retirement (partial)
--
-- The deposit model was retired in Phase 2; checkout inserts deposit_amount 0
-- as a bridge. Drop NOT NULL now so new code can stop writing it. The column
-- itself (and deposit_payment_intent_id / final_payment_intent_id, both dead)
-- is removed in a later cleanup -- meetups/[id]/cancel/page.tsx still SELECTs
-- deposit_amount, and chasing readers mid-payments-phase is how you break a
-- money flow for a cosmetic win.
-- ============================================================
ALTER TABLE meetups ALTER COLUMN deposit_amount DROP NOT NULL;

-- ============================================================
-- 6. CORE MONEY-INTEGRITY INVARIANT
--
--   No meetup may reach status='completed' without a captured order.
--
-- Enforced in the database, not just in the confirm routes, so it holds no
-- matter which code path runs -- the legacy client-side completion component,
-- the legacy cron auto-complete pass, a future route, or a hand-written SQL
-- update in the dashboard. Completion is what projects a payout into the
-- ledger; allowing it without captured funds is the one thing that must be
-- impossible.
--
-- Accepted orders states: 'paid_held' (funds held), 'releasing' (transfer in
-- flight), 'released' (paid out). Deliberately NOT 'refunded' -- a refunded
-- order means the sale did not happen, so its meetup must not complete.
--
-- The trigger fires only on the TRANSITION into 'completed' (and on inserting
-- a row already completed). Later updates to an already-completed meetup --
-- reviews, flags, backfills -- pass untouched.
-- ============================================================
CREATE OR REPLACE FUNCTION enforce_completion_requires_paid_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM orders o
    WHERE o.meetup_id = NEW.id
      AND o.status IN ('paid_held', 'releasing', 'released')
  ) THEN
    RAISE EXCEPTION
      'meetup % cannot be completed: no captured order (needs orders.status in paid_held/releasing/released)',
      NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meetup_complete_requires_paid_order ON meetups;
CREATE TRIGGER trg_meetup_complete_requires_paid_order
  BEFORE UPDATE ON meetups
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION enforce_completion_requires_paid_order();

DROP TRIGGER IF EXISTS trg_meetup_insert_requires_paid_order ON meetups;
CREATE TRIGGER trg_meetup_insert_requires_paid_order
  BEFORE INSERT ON meetups
  FOR EACH ROW
  WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION enforce_completion_requires_paid_order();

-- ============================================================
-- 7. RLS
--
-- No policy changes needed. orders' existing participant-SELECT policy (mig
-- 014) already covers the new columns, so buyers/sellers can read their own
-- release state. Every WRITE in Phase 3 goes through the service-role client
-- (releaseOrder, the confirm routes, the cron sweep), which bypasses RLS.
-- No new anon-writable surface is introduced.
-- ============================================================
