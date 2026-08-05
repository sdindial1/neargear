-- Tighten users RLS — POST-LAUNCH item 4, the last pre-deploy security item.
--
-- Before this, users had `FOR SELECT USING (true)`: anyone with the anon key
-- could read every row, including email, phone, spouse contact details,
-- suspension state and stripe_account_id. The key is embedded in the client
-- bundle, so "anyone" means anyone who opens devtools.
--
-- APPROACH
-- Row-level security cannot restrict COLUMNS, and column grants cannot vary by
-- row — so neither alone expresses "all columns for your own row, safe columns
-- for everyone else". This uses both layers:
--
--   1. users        -> own row only. Sensitive columns become unreachable by
--                      any client, for any other user.
--   2. public_profiles -> a view exposing only the columns the UI genuinely
--                      needs about other people. Owned by postgres, so it reads
--                      the base table with definer rights and is unaffected by
--                      the policy above.
--
-- Verified before writing: PostgREST resolves hinted embeds through the view
-- (`seller:public_profiles!seller_id(...)`), which is the form every query in
-- the app already uses. Unhinted embeds return PGRST201 (ambiguous) — the app
-- never does that.
--
-- Run in the Supabase SQL Editor, after 019.

-- ============================================================
-- 1. The public projection.
--
-- Deliberately EXCLUDES zipcode: a postcode is materially more precise than
-- the city already shown on listing cards, and it is a family's home area. The
-- one place that needed a seller's zip (the meetup request page) now resolves
-- it server-side with the service role.
--
-- INCLUDES stripe_payouts_enabled: functionally "this listing is buyable". It
-- carries no personal information and it gates the buyer's Pay button.
-- ============================================================
CREATE OR REPLACE VIEW public.public_profiles AS
  SELECT
    id,
    full_name,
    avatar_url,
    avg_rating,
    review_count,
    city,
    is_founding_member,
    created_at,
    stripe_payouts_enabled
  FROM public.users;

-- Definer semantics: the view runs as its owner, so RLS on users does not
-- apply to it. This is what lets the public projection stay readable while the
-- base table is locked to own-row. Postgres 15+ would allow
-- security_invoker=true here; we specifically do NOT want that.
ALTER VIEW public.public_profiles SET (security_invoker = false);

-- REVOKE first. Supabase ships a default `GRANT ALL ON ALL TABLES IN SCHEMA
-- public TO anon, authenticated`, which applies to newly created relations —
-- so a bare GRANT SELECT here would leave anon holding INSERT, UPDATE, DELETE,
-- TRUNCATE, REFERENCES and TRIGGER on the view as well.
--
-- Not exploitable as written (a simple projection is not auto-updatable, and
-- users RLS blocks the underlying rows anyway), but granting anon TRUNCATE on
-- anything stops being harmless the moment the view's shape changes.
REVOKE ALL ON public.public_profiles FROM anon, authenticated;
GRANT SELECT ON public.public_profiles TO anon, authenticated;

COMMENT ON VIEW public.public_profiles IS
  'Safe, publicly readable subset of users. The base table is own-row only; '
  'read other people through this. Excludes email, phone, spouse fields, '
  'zipcode, suspension state and all Stripe account identifiers.';

-- ============================================================
-- 2. Lock the base table to own-row reads.
--
-- Replaces "Users are viewable by everyone" from 001_base_schema.
-- ============================================================
DROP POLICY IF EXISTS "Users are viewable by everyone" ON public.users;
DROP POLICY IF EXISTS "Users can view own row" ON public.users;

CREATE POLICY "Users can view own row"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

-- ============================================================
-- 3. Reviews carry a public author name, so they need the same treatment.
--    (Flagged alongside users in POST-LAUNCH item 4.)
--    Left permissive deliberately: a review has no contact information, and
--    hiding reviews would break seller reputation on every listing page.
-- ============================================================
-- (no change — recorded here so the decision is explicit rather than an
--  oversight discovered later.)

-- ============================================================
-- 4. Make PostgREST pick up the new view and policy.
-- ============================================================
NOTIFY pgrst, 'reload schema';
