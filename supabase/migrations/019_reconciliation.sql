-- Schema reconciliation — closes the drift between the dev database and the
-- migration file set. See RECONCILIATION.md and _recon/schema-diff.md.
--
-- WRITTEN TO CONVERGE ANY DATABASE ON THE SAME SCHEMA. Every statement is
-- guarded, so this is a series of no-ops against a fresh database built from
-- 001–018, and a cleanup against the dev database. Run it in both places.
--
-- WHY NOTHING DEV-ONLY IS "CAPTURED" HERE
-- The diff found nine objects in dev that no migration creates. None of them
-- should be carried into production:
--   * 4 are permissive RLS policies that defeat the tightened 004 policies
--   * 3 are dead (orders.resolved_by + its FK, a superseded index)
--   * 1 is a legacy column 008 was always meant to remove (strikes.reason)
--   * 1 is a duplicate policy 008 supersedes
-- So the reconciliation direction is dev -> files, not files -> dev.
--
-- 008 and 011 do the rest of the work on dev: 008 recreates `strikes`, which
-- simultaneously fixes strikes.reason, the meetup FK's ON DELETE SET NULL, the
-- duplicate policy, and the meetups_status_check missing 'item_dispute'.
--
-- Run in the Supabase SQL Editor, after 018.

-- ============================================================
-- 1. SECURITY: drop the permissive policies that no file creates.
--
-- These predate 004_proper_rls, which added tightened policies but never
-- removed the originals. Postgres ORs policies together, so wherever they
-- overlap THE PERMISSIVE ONE WINS -- meaning `USING (true)` UPDATE on meetups
-- has been silently defeating 004 on dev this whole time.
--
-- A fresh database from 001–018 never had these. This makes dev match.
-- ============================================================
DROP POLICY IF EXISTS "Anyone can update meetups" ON meetups;
DROP POLICY IF EXISTS "Anyone can read meetups"   ON meetups;
DROP POLICY IF EXISTS "Anyone can create meetups" ON meetups;
DROP POLICY IF EXISTS "Anyone can insert listings" ON listings;

-- Superseded by 008's "Users see own strikes".
DROP POLICY IF EXISTS "Users can view their own strikes" ON strikes;

-- ============================================================
-- 2. Drop dead objects that exist only on dev.
--
-- orders.resolved_by looks like an early draft of dispute_resolved_by (016).
-- No migration creates it and no code references it.
-- ============================================================
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_resolved_by_fkey;
ALTER TABLE orders DROP COLUMN IF EXISTS resolved_by;

-- Hand-created and strictly narrower than 016's idx_orders_review_queue, which
-- covers paid_held AND release_failed. Keeping both would mean maintaining two
-- indexes for one query.
DROP INDEX IF EXISTS idx_orders_active_dispute;

-- ============================================================
-- 3. Align orders.refund_initiated_by with what 017 declares.
--
-- 017 declares `UUID REFERENCES users(id)`, but dev already had the column as
-- TEXT, so ADD COLUMN IF NOT EXISTS skipped it and dev kept the wrong type with
-- no foreign key. The column is unused and empty, so the cast is safe.
--
-- (This column is still a candidate for removal -- see RECONCILIATION.md. It is
-- aligned rather than dropped so the decision stays explicit rather than
-- happening by accident here.)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'orders'
       AND column_name = 'refund_initiated_by' AND data_type <> 'uuid'
  ) THEN
    ALTER TABLE orders
      ALTER COLUMN refund_initiated_by TYPE UUID USING refund_initiated_by::uuid;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'orders_refund_initiated_by_fkey'
       AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_refund_initiated_by_fkey
      FOREIGN KEY (refund_initiated_by) REFERENCES users(id);
  END IF;
END $$;

-- ============================================================
-- 4. Belt-and-braces: assert the two constraints that differed.
--
-- 008 sets both when it runs, so these are redundant on a database that has
-- applied it. They are here so 019 alone brings a partially-migrated database
-- into line, rather than depending on 008 having been run first.
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
    'disputed',
    'item_dispute'
  ));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'strikes_meetup_id_fkey'
       AND conrelid = 'public.strikes'::regclass
       AND confdeltype <> 'n'          -- 'n' = SET NULL
  ) THEN
    ALTER TABLE strikes DROP CONSTRAINT strikes_meetup_id_fkey;
    ALTER TABLE strikes
      ADD CONSTRAINT strikes_meetup_id_fkey
      FOREIGN KEY (meetup_id) REFERENCES meetups(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================
-- 5. Make PostgREST see all of it.
-- ============================================================
NOTIFY pgrst, 'reload schema';
