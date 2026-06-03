-- Phase 1: Partner Programs — data model only.
-- Revenue-share partnerships with leagues / organizations (DYB and future
-- leagues). NO attribution logic or landing pages yet — those are later phases.
-- Run in the Supabase SQL Editor.
--
-- Admin email list note: the policies below mirror src/lib/admin.ts
-- (ADMIN_EMAILS). Keep the two in sync. amaro.medina@near-gear.com is included
-- ahead of the app-side switch from amaro_02@hotmail.com. Functionally, the
-- admin UI reaches these tables via the service-role client (bypasses RLS), so
-- these policies are defense-in-depth for any direct PostgREST access.

-- ============================================================
-- partner_programs
-- ============================================================
CREATE TABLE IF NOT EXISTS partner_programs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  legal_name TEXT,
  is_nonprofit BOOLEAN DEFAULT FALSE,
  ein TEXT,
  rev_share_percent NUMERIC(5,2) NOT NULL DEFAULT 30.0,
  -- Stored as percent of NearGear platform revenue (e.g. 30.00 = 30% of fees)
  badge_text TEXT,
  badge_color TEXT DEFAULT '#ff6b35',
  landing_page_url TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  -- active | paused | ended
  start_date DATE,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_status CHECK (
    status IN ('active', 'paused', 'ended')
  ),
  CONSTRAINT valid_percent CHECK (
    rev_share_percent >= 0 AND rev_share_percent <= 100
  )
);

CREATE INDEX IF NOT EXISTS idx_partner_programs_slug
  ON partner_programs(slug);
CREATE INDEX IF NOT EXISTS idx_partner_programs_status
  ON partner_programs(status);

-- ============================================================
-- users — partner membership fields
-- ============================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS partner_program_id UUID REFERENCES partner_programs(id),
  ADD COLUMN IF NOT EXISTS partner_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS partner_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS referral_source TEXT;

CREATE INDEX IF NOT EXISTS idx_users_partner_program
  ON users(partner_program_id)
  WHERE partner_program_id IS NOT NULL;

-- ============================================================
-- partner_transactions — attribution tracking (populated in Phase 3)
-- ============================================================
-- ATTRIBUTION RULE (implemented in Phase 3, recorded here so the schema is
-- built with it in mind): a Founding Family user tagged to a partner program
-- (e.g. Jeff as DYB founding family) does NOT generate partner attribution.
-- Their sales are 0% platform fee, so there is no platform revenue to share —
-- NO partner_transactions row is created for them. partner leagues earn their
-- rev-share only from NON-founding members' platform fees.
--
-- For reporting we can still answer "what WOULD have attributed if the seller
-- weren't founding family" by joining transactions -> users (is_founding_member)
-- against attributed_amount = 0 rows; see the optional analytics note at the
-- bottom of this file. The user-facing story stays clean: founding families pay
-- 0% fees, partner leagues get rev_share_percent of platform fees from everyone
-- else.
CREATE TABLE IF NOT EXISTS partner_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL,
  -- References transactions(id). Left as a bare UUID (no FK) on purpose so
  -- financial attribution records survive if a source transaction row is ever
  -- deleted — accounting history should not cascade away.
  partner_program_id UUID NOT NULL REFERENCES partner_programs(id),
  seller_id UUID NOT NULL REFERENCES users(id),
  gross_sale_amount INTEGER NOT NULL,        -- cents
  platform_fee_amount INTEGER NOT NULL,      -- cents
  attributed_amount INTEGER NOT NULL,        -- cents (rev_share_percent of platform_fee_amount)
  payout_status TEXT NOT NULL DEFAULT 'pending',
  -- pending | paid | reversed
  partner_payout_id UUID,
  -- FK to partner_payouts when paid (set during payout recording)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_payout_status CHECK (
    payout_status IN ('pending', 'paid', 'reversed')
  )
);

CREATE INDEX IF NOT EXISTS idx_partner_tx_partner
  ON partner_transactions(partner_program_id);
CREATE INDEX IF NOT EXISTS idx_partner_tx_status
  ON partner_transactions(payout_status);
CREATE INDEX IF NOT EXISTS idx_partner_tx_created
  ON partner_transactions(created_at);

-- ============================================================
-- partner_payouts — disbursements
-- ============================================================
CREATE TABLE IF NOT EXISTS partner_payouts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  partner_program_id UUID NOT NULL REFERENCES partner_programs(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_gross_sales INTEGER NOT NULL,
  total_platform_fees INTEGER NOT NULL,
  total_attributed INTEGER NOT NULL,   -- amount owed to partner (cents)
  payout_amount INTEGER NOT NULL,      -- amount actually paid (cents)
  payout_method TEXT,                  -- check | ach | wire | other
  payout_reference TEXT,               -- check number, transaction ID, etc.
  paid_at TIMESTAMPTZ,
  paid_by_admin_id UUID REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payouts_partner
  ON partner_payouts(partner_program_id);
CREATE INDEX IF NOT EXISTS idx_payouts_period
  ON partner_payouts(period_start, period_end);

-- Now that partner_payouts exists, point the transactions FK at it.
ALTER TABLE partner_transactions
  DROP CONSTRAINT IF EXISTS partner_transactions_partner_payout_id_fkey;
ALTER TABLE partner_transactions
  ADD CONSTRAINT partner_transactions_partner_payout_id_fkey
  FOREIGN KEY (partner_payout_id) REFERENCES partner_payouts(id) ON DELETE SET NULL;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE partner_programs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_payouts      ENABLE ROW LEVEL SECURITY;

-- Admin can do everything (mirrors src/lib/admin.ts ADMIN_EMAILS)
DROP POLICY IF EXISTS "Admins can manage partner programs" ON partner_programs;
CREATE POLICY "Admins can manage partner programs"
  ON partner_programs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND email IN (
        'shaun.dindial@gmail.com',
        'amaro_02@hotmail.com',
        'amaro.medina@near-gear.com'
      )
    )
  );

-- Anyone can read active programs (for landing pages, future phase)
DROP POLICY IF EXISTS "Active programs are public" ON partner_programs;
CREATE POLICY "Active programs are public"
  ON partner_programs FOR SELECT
  USING (status = 'active');

DROP POLICY IF EXISTS "Admins manage partner transactions" ON partner_transactions;
CREATE POLICY "Admins manage partner transactions"
  ON partner_transactions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND email IN (
        'shaun.dindial@gmail.com',
        'amaro_02@hotmail.com',
        'amaro.medina@near-gear.com'
      )
    )
  );

DROP POLICY IF EXISTS "Admins manage partner payouts" ON partner_payouts;
CREATE POLICY "Admins manage partner payouts"
  ON partner_payouts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND email IN (
        'shaun.dindial@gmail.com',
        'amaro_02@hotmail.com',
        'amaro.medina@near-gear.com'
      )
    )
  );

-- ============================================================
-- partner_program_stats — per-program rollup for the admin list page
-- ============================================================
-- security_invoker = true so the view respects the caller's RLS. The admin UI
-- reads it via the service-role client (which bypasses RLS, so all rows show);
-- any anon/authenticated PostgREST read gets the financial aggregates filtered
-- by partner_transactions' admin-only policy (i.e. zeros), preventing leakage.
CREATE OR REPLACE VIEW partner_program_stats
WITH (security_invoker = true) AS
SELECT
  pp.id,
  pp.slug,
  pp.name,
  pp.rev_share_percent,
  pp.status,
  COUNT(DISTINCT u.id) FILTER (WHERE u.partner_verified = TRUE) AS verified_members,
  COUNT(DISTINCT pt.id) AS total_transactions,
  COALESCE(SUM(pt.gross_sale_amount), 0) AS lifetime_gross_sales,
  COALESCE(SUM(pt.attributed_amount), 0) AS lifetime_attributed,
  COALESCE(SUM(pt.attributed_amount) FILTER (WHERE pt.payout_status = 'pending'), 0) AS pending_payout,
  COALESCE(SUM(pt.attributed_amount) FILTER (WHERE pt.payout_status = 'paid'), 0) AS total_paid_out
FROM partner_programs pp
LEFT JOIN users u ON u.partner_program_id = pp.id
LEFT JOIN partner_transactions pt ON pt.partner_program_id = pp.id
GROUP BY pp.id;

-- ============================================================
-- OPTIONAL analytics (Phase 3+, not required): "shadow attribution" — what a
-- partner WOULD have earned from founding-family sales if those weren't fee-free.
-- Left commented; uncomment when transactions carry enough data to compute it.
-- ============================================================
-- CREATE OR REPLACE VIEW partner_shadow_attribution
-- WITH (security_invoker = true) AS
-- SELECT
--   u.partner_program_id,
--   t.id AS transaction_id,
--   t.gross_amount,
--   ROUND(t.gross_amount * 0.08)                              AS hypothetical_platform_fee,
--   ROUND(t.gross_amount * 0.08 * pp.rev_share_percent / 100) AS hypothetical_attributed
-- FROM transactions t
-- JOIN users u ON u.id = t.seller_id
-- JOIN partner_programs pp ON pp.id = u.partner_program_id
-- WHERE u.is_founding_member = TRUE;
