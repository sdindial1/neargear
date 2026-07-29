# POST-LAUNCH.md

Deferred work — deliberately scoped out of the payments phases so they stayed
shippable. Nothing here is a bug in what shipped; each item is a known,
accepted deferral with a trigger point.

Last updated: 2026-07-29, after payments Phase 2 merged to `main` (`8e0ce3f`).

**Legend — when to action:**
- 🔴 **BEFORE REAL USERS** — must be done before the first non-test user or real money.
- 🟡 **PHASE 3** — folds into the payments Phase 3 (transfers/release) lifecycle work.
- 🟢 **POST-LAUNCH** — safe to carry into production; revisit when there's room.

---

## 🔴 1. Rotate the Stripe test keys

`STRIPE_SECRET_KEY` (`sk_test_…`) and `STRIPE_WEBHOOK_SECRET` (`whsec_…`) were
both pasted through a chat session. They are test-mode keys, so exposure is
low-severity — but they are still credentials to a real Stripe account and the
habit matters more than this instance.

**How to apply:**
1. Stripe Dashboard → Developers → API keys → roll the secret key.
2. Re-run `stripe listen --forward-to localhost:3000/api/webhooks/stripe` to get a fresh `whsec_`.
3. Update `.env.local` **and** the Vercel Preview-scoped env vars.
4. Never paste the live-mode keys anywhere when launch comes — set them directly in the Vercel dashboard.

Note: no key has ever been committed. `.env*` is gitignored, the repo contains
only placeholder/doc references, and the built client bundle was verified clean.

---

## 🔴 2. `users` table RLS is wide open

`supabase/schema.sql:131`:

```sql
CREATE POLICY "Users are viewable by everyone"
  ON users FOR SELECT USING (true);
```

The whole `users` row is publicly readable by anyone with the anon key — that
now includes **email, phone, spouse/household fields, and `stripe_account_id`**
(added in migration 013). Migration 004 tightened everything else; this table
was left permissive because the marketplace UI reads seller names/avatars from
it everywhere.

**How to apply:** Split the read. Either (a) a public view exposing only
`id, display_name, avatar_url, created_at, founding_*` with `security_invoker`,
repointing listing/meetup joins at it, or (b) column-level grants plus a
narrowed policy. Do this as one focused pass with `scripts/verify-rls.mjs` as
the check. Deliberately deferred during payments so the payment work stayed
scoped — but it must land before real users.

Related: `reviews` is also `USING (true)` (`schema.sql:180`) — likely fine, but
audit it in the same pass.

---

## 🔴 3. `NEXT_PUBLIC_APP_URL` must point at the production domain

`src/lib/stripe-connect.ts:18`:

```ts
export function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://near-gear.com";
}
```

It is `http://localhost:3000` in `.env.local`. The fallback is correct, so an
**unset** var is safe — the danger is a localhost value being copied into the
Vercel production env, which silently breaks:

- Stripe Connect onboarding `return_url` / `refresh_url` (sellers get bounced to localhost)
- Stripe Checkout success/cancel URLs
- Every email and SMS link (`src/lib/notifications/`)

**How to apply:** At deploy, set `NEXT_PUBLIC_APP_URL=https://near-gear.com` in
the Vercel **Production** scope, or leave it unset and lean on the fallback.
Verify by completing one Connect onboarding round-trip on production.

---

## 🔴 4. Tier 2 deposit copy scrub (incl. a live legal contradiction)

The deposit model was retired in favor of full payment at accept. Phase 2
(`8e0ce3f`) scrubbed the *functional* screens only. Marketing, metadata, and
legal copy were deliberately left untouched — they need deliberate rewriting,
not find-and-replace.

**Marketing / metadata:**
- `src/app/layout.tsx:21` — site meta description, "Deposit-backed meetups at verified safe zones"
- `src/app/layout.tsx:65` — Open Graph description, "deposit-backed meetups"
- `src/app/layout.tsx:73` — Twitter card description, "Deposit-backed meetups"
- `src/app/page.tsx:355` — homepage, "Deposit-backed. No ghosting."
- `src/app/page.tsx:451` — homepage, "Deposit-backed meetups. Every buyer puts skin in the game"

**Legal — needs a deliberate rewrite, not a copy edit:**
- `src/content/terms-of-service.ts:154` — **§6 Deposit Policy**, the whole section
- also `:33`, `:128`, `:133`, `:142` (deposit references in the flow description)
- `src/content/privacy-policy.ts:81`, `:126` — deposit lines

> ⚠️ **The published ToS now contradicts shipped behavior.** §6.3 states
> *"Buyer no-shows → Seller receives deposit"* and §6.2 states deposits are
> *"typically 10-25% of the listing price."* As of `8e0ce3f` the code does
> neither: a buyer no-show issues a **buyer strike with a full refund to the
> buyer and no seller payout**, and buyers pay the **full amount plus a 10%
> Buyer Protection fee**. Terms that misdescribe how money moves are the
> highest-risk copy on the site — treat §6 as the top item in this group and
> rewrite it to the full-payment model before real users transact.

DB/schema `deposit_*` identifiers (`meetups.deposit_amount`,
`messages.deposit_pending` status) are intentionally **not** in scope here —
see item 6.

---

## 🟡 5. Enforce mutual location agreement before `scheduled`

A meetup can currently reach `scheduled` (which unlocks the buyer's pay button)
without both parties having explicitly agreed on the meetup location. The
counter-offer flow carries a location, but there is no hard gate asserting
mutual agreement before money is collected.

**How to apply:** Fold into the Phase 3 lifecycle rework — add an explicit
agreed-location assertion on the `requested`/`countered` → `scheduled`
transition in `src/lib/meetups/actions.ts`, so acceptance and location
agreement are the same atomic step. Deferred from Phase 2 because it touches
the same state machine Phase 3 is going to rewrite anyway.

---

## 🟡 6. Phase 3 payment-model reconciliation

Carried over from the Phase 1/2 build notes. All of this is Phase 3's job:

- **`meetups.deposit_amount` is `NOT NULL`.** Phase 2 inserts `0` as a bridge
  (`src/app/listings/[id]/request/page.tsx:291`). Drop the column or make it
  nullable in Phase 3.
- **`src/lib/fees.ts` tiered helpers.** `calculatePlatformFee` /
  `calculateSellerPayout` / `calculateDisputeReserve` are marked `@deprecated`
  but still power the meetup-**completion** path
  (`complete-transaction-section.tsx`, `api/cron/expire-requests`). Phase 3 must
  migrate completion onto the flat model (`calculateSellerFee` /
  `computeOrderBreakdown`) and retire the tiered/reserve logic.
- **`messages.deposit_pending` status** — rename or retire alongside the above.

---

## 🟢 7. Real-time notifications

The notification bell does not alert on a new message or meetup request until
the user clicks into it — counts are computed on page load, so a user sitting
on a page never learns anything happened. This is the single biggest UX gap in
the product and it is **a whole separate system, not a patch.**

**Scope when picked up:**
- Supabase Realtime subscriptions on `notifications` / `messages` for live in-app badge updates
- Web Push (service worker + `PushSubscription`) for out-of-app delivery
- Possibly SMS via Twilio for high-value events (offer accepted, payment received) — `src/lib/notifications/sms.ts` already degrades gracefully when unconfigured
- Notification preferences UI so users can pick channels per event type

Deferred because it is a multi-session build and none of it blocks a
transaction from completing.

---

## 🟢 8. Evaluate Accounts v2 Connect migration

Our Connect setup is **v1 Express** (`accounts.create({ type: 'express' })` +
`payouts_enabled` checks). Stripe now recommends Accounts v2
(`v2.core.accounts` + `configuration.recipient.stripe_transfers` capability +
the v2 thin-event webhook model).

**Decided 2026-07-22: stay on v1 for launch — do NOT migrate now.** v1 Express
works and is tested end-to-end, and `stripe@22` supports v2 whenever we want it.

> ⚠️ **Migration cost grows with every real seller.** Connected accounts created
> on v1 would have to **re-onboard** if we later move to v2. Factor that into
> any future decision — the longer this sits, the more expensive it gets.

Revisit only post-launch, or sooner if Connect problems surface. This is an
accepted deferral, not a bug.

---

## 🟢 9. Decline/Cancel button redundancy on the seller meetup view

Minor UX cleanup. On `meetups/[id]`, a seller looking at a `requested` /
`countered` meetup sees both the new **Decline** action
(`src/components/meetup-seller-actions.tsx`, added in `8e0ce3f`) and the
pre-existing **Cancel** link — two buttons that read as the same destructive
action but take different paths.

**How to apply:** Hide Cancel for the seller while `MeetupSellerActions` is
rendered (status `requested`/`countered`), so Decline is the only pre-acceptance
exit and Cancel only appears once the meetup is `scheduled`.
