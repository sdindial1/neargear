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

## 🔴 11. Migration files have drifted from the live schema — LAUNCH BLOCKER

**This is not optional and not a cleanup task.** Deploying runs the migration
files against a database. If the files don't reproduce the schema the code was
developed against, production breaks on first request — and the failure mode is
a 500 on a payment route, not a build error.

Drift is confirmed in **both directions**, which is what makes it dangerous:

**Files ahead of the DB.** `008_strikes.sql` declares 9 columns and has never
been applied. Dev is missing `meetups.no_show_reported_by/_at`,
`no_show_prompt_sent_at`, `item_dispute_reported_at/_reason/_notes`,
`users.strike_count`, `suspension_ends_at`, `suspended_permanently`, and
`strikes.type/issued_by/notes` — so the no-show route, the item-dispute route
and `issueStrike` have **never once run successfully**. On deploy the file
*would* run, meaning production gets a schema dev never tested against.

**DB ahead of the files.** During Phase 4, columns were hand-added to `orders`
one at a time in response to errors, producing a scattered subset
(`refunded_at`, `refund_reason`, `freeze_reason` present; seven others absent)
that matches no migration file's state. Any column added by hand that is in no
file simply won't exist in production.

**The unknown is the real risk.** Nobody has audited which live columns are
backed by a migration file. Every unbacked column is a silent landmine that
only fires on deploy.

**How to apply — reconciliation method:**

1. Capture the truth: dump the live dev schema (`pg_dump --schema-only`, or
   Supabase → Database → Schema).
2. Build a control: run `001` → `016` in order against a scratch database.
3. Diff the two. Every difference is either a missing migration or an
   unapplied one.
4. Resolve each: apply what's missing to dev (e.g. `008`), and write a
   reconciliation migration for anything live that no file creates.
5. Prove it: a fresh database plus the ordered file set must equal the dev
   schema exactly. That is the acceptance test — not "it looks right".
6. Prevent recurrence: adopt tracked migrations (a `schema_migrations` table,
   or the Supabase CLI with `supabase db push`) so an unapplied file can't sit
   unnoticed for four phases again.

**Why it went unnoticed:** migrations are applied by hand-pasting into the SQL
Editor, with nothing recording which have run. `008` was skipped silently in
roughly April and only surfaced in August, during Phase 4, because the release
sweep needed a column it declared.

**A second class of drift, found the same way — code not populating a column
it declares.** Migration 016 added `orders.stripe_charge_id`, but the Phase 2
checkout webhook never wrote it, so every real order had the column and left
it null. This was NOT a refund blocker — `refundOrder` keys off the
PaymentIntent, and `stripe.refunds.create({ payment_intent })` is complete on
its own — but `releaseOrder` was re-deriving the charge from Stripe on every
single release to pass `source_transaction`, an avoidable round-trip on the
money path. Fixed at source: the webhook now resolves and stores the charge,
`releaseOrder` prefers the stored value and only falls back to deriving it,
and existing orders were backfilled.

The lesson for the reconciliation pass: a schema audit must check **both** that
every live column is backed by a migration file **and** that every column a
migration declares is actually written by the code that owns it. A declared-
but-never-populated column looks fine in a schema diff and is only found when
something downstream needs the value.

Do this **after Phase 4 code is complete and before any production deploy.**
Running it earlier means redoing it — Phase 4 is still adding schema.

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

## ✅ 6. Phase 3 payment-model reconciliation — DONE

Closed out by payments Phase 3 (2026-07-31):

- ~~`meetups.deposit_amount` `NOT NULL`~~ → dropped NOT NULL in migration 015.
  The **column itself** and its dead siblings (`deposit_payment_intent_id`,
  `final_payment_intent_id`) still exist; `meetups/[id]/cancel/page.tsx` still
  SELECTs `deposit_amount`. Removing them is leftover cleanup, not blocking.
- ~~`src/lib/fees.ts` tiered helpers~~ → `calculatePlatformFee`,
  `calculateSellerPayout` and `calculateDisputeReserve` are deleted. `fees.ts`
  now holds only the flat model, and `releaseOrder()` derives the payout from
  cents written at checkout, so there is nothing left to drift against.
- **`messages.deposit_pending` status** — still there. Rename or retire with
  the column cleanup above. Not urgent; nothing reads it for money.

Still open from the same area:

- **Partner attribution is unwired.** `src/lib/partner-attribution.ts` was
  written expecting Phase 3 to call it from the completion flow; attribution
  was explicitly out of Phase 3 scope, so nothing calls `computeAttribution`
  and no `partner_transactions` rows are ever created. Hooking it into
  `releaseOrder`'s projection is open work. Open product question noted in that
  file: whether partner rev share applies to the buyer fee as well as the
  seller fee.

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

---

## 🟢 10. Late-seller-cancel carries no consequence

A seller can cancel a meetup two hours before it starts with **no strike, no
reputation impact, and no record beyond the status change**. The old
client-side cancel path had a placeholder for this:

```ts
if (isLate && role === "seller") {
  console.log(`[strike] Late cancellation by seller … — would record strike`);
}
```

That stub was deleted when cancel moved server-side in Phase 3 Step 6 (it never
did anything), so the gap is now honest rather than hidden behind a log line.
The `isLate` calculation (`< 2h` before the window) still exists in
`src/app/meetups/[id]/cancel/page.tsx` and drives a UI warning — it just has no
consequence attached.

**Why it matters:** the product promise is "no ghosting." A buyer cancelled on
the morning of a meetup has no recourse, and the seller has no incentive not to
do it again. The strike machinery already exists (`src/lib/strikes.ts`,
migration 008), and now that cancellation is server-side, issuing a strike from
`POST /api/meetups/[id]/cancel` is a small change.

**How to apply:** decide threshold and severity (a late cancel is not as bad as
a no-show), add the strike type, call `issueStrike` in the cancel route.
Consider whether a late cancel on a **paid** meetup deserves worse — that one
also strands the buyer's money until Phase 4 resolves it.

---

# Phase 4 (refunds & dispute resolution) — scope inputs

Not deferrals; these are things Phase 3 deliberately left for Phase 4 and
discovered while building it. Read before scoping Phase 4.

**1. Post-release reversal — the already-released case.** Phase 3 freezes
auto-release on dispute, no-show and cancel, but a report can land *after* the
transfer already went out (rung 1 releases within seconds of the buyer
confirming). `freezeOrdersForMeetup()` detects this and returns
`alreadyReleased: true`, logging:

```
[freeze] meetup … reported as no_show but order … was ALREADY RELEASED
(transfer tr_…). Funds are with the seller; reversal is a Phase 4 concern.
```

Nothing acts on it today. Phase 4 needs a real answer: reverse the transfer
(`stripe.transfers.createReversal`) if the connected account still holds the
funds, and decide what happens when it doesn't — negative balance on the
seller, platform absorbs it, or collections. This is the single most
consequential unhandled money path left.

**2. Refund paths with no implementation.** Copy already promises refunds that
nothing performs: the cancel flow, the buyer-no-show path (buyer strike + full
refund per `8e0ce3f`), and the item-dispute notification that literally tells
the buyer *"Your payment will be refunded."* Today those orders sit frozen at
`paid_held` indefinitely. Phase 4 must either honour the copy or change it.

**3. Orders parked in `release_failed`.** After 5 failed transfer attempts an
order stops retrying and `alertCritical` fires. There is no admin surface to
inspect or requeue them — recovery is manual SQL (`status='paid_held'`,
`transfer_attempts=0`). An admin view belongs with Phase 4's money tooling.

**4. `orders.disputed_at` is a boolean-ish flag, not a case.** It carries no
reason, no reporter, no resolution state, and no audit trail — the reason lives
on the meetup (`item_dispute_reason`) or nowhere at all (cancel). Phase 4 will
likely need a real dispute record to resolve against.

**5. The charge id is not persisted.** `releaseOrder` resolves it at runtime
from the PaymentIntent for `source_transaction`. Refunds need it too; consider
storing `stripe_charge_id` on the order rather than re-deriving it.
