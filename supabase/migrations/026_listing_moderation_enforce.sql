-- ============================================================
-- 026: Close the client-side publish path
--
-- SPLIT FROM 025 ON PURPOSE. Everything in 025 is additive and safe to apply
-- while the old code is still serving traffic. This file is the breaking half.
--
-- The sell page used to INSERT from the BROWSER with status hardcoded to
-- 'active' (src/app/sell/page.tsx). The anon key ships in the client bundle,
-- so any account could POST straight to PostgREST and publish without ever
-- passing the classifier -- the same reasoning 022 wrote down for why
-- sweepstakes_entries takes no anon INSERT. A moderation gate that lives in
-- the page it is meant to gate is not a gate.
--
-- Listing creation now goes through POST /api/listings, which uses the service
-- role and therefore bypasses RLS. This policy is the backstop underneath it:
-- a direct client INSERT still succeeds, but it can ONLY land in the queue.
-- There is no path from a browser to a live listing.
--
-- DEPLOY ORDER -- this one is the exception to the usual rule:
--   1. apply 025 (additive, safe any time)
--   2. deploy the code (POST /api/listings + the rewritten sell page)
--   3. apply 026
-- Applying 026 BEFORE the code is deployed makes every listing attempt fail
-- with an RLS violation, because the live sell page still sends
-- status = 'active'. The usual "migration first, then code" rule assumes an
-- additive change; this one revokes a capability the running code still uses.
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can insert listings" ON listings;
CREATE POLICY "Authenticated users can insert listings"
  ON listings FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = seller_id
    AND status = 'pending_review'
  );

COMMENT ON POLICY "Authenticated users can insert listings" ON listings IS
  'Client inserts may only create held listings. Publishing decisions belong '
  'to POST /api/listings (service role), which runs the classifier first.';

NOTIFY pgrst, 'reload schema';
