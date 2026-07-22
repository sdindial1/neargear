-- Phase 1: Seller Stripe Connect (Express) onboarding — data model only.
-- Sellers must connect a Stripe Express account before they can be paid.
-- Buyer checkout / capture / transfers / payouts / refunds are LATER phases.
-- Run in the Supabase SQL Editor.
--
-- TEST MODE: stripe_account_id here will be a test-mode acct_... id. When we
-- eventually switch to live keys, existing test acct_... ids will NOT be valid
-- against live Stripe — sellers re-onboard against live mode at that cutover.

-- ============================================================
-- users — Stripe Connect (Express) fields
-- ============================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_account_id TEXT,
  -- Stripe Express connected account id (acct_...). NULL until the seller
  -- first initiates onboarding.
  ADD COLUMN IF NOT EXISTS stripe_onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE,
  -- TRUE once Stripe reports details_submitted on the account. Onboarding form
  -- finished; does not by itself guarantee payouts are enabled.
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE;
  -- TRUE once Stripe reports payouts_enabled — the account can actually receive
  -- transfers/payouts. This is the gate we check before paying a seller.

-- One Stripe account per user. Partial unique index so the many NULLs
-- (unconnected sellers) don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_account_id
  ON users(stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;

-- Note on RLS: the webhook and status-sync routes write these columns via the
-- service-role client (bypasses RLS), so no new write policy is needed. Sellers
-- read their own row via existing "users can read own row" policy (migration
-- 004), which already exposes all columns of their own record — including these.
