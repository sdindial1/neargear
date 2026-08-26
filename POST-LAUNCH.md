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

## ✅ 1. SCHEMA DRIFT — RESOLVED 2026-08-05

> **See [RECONCILIATION.md](RECONCILIATION.md)** for the full record.

A fresh database built from `001` → `019` is now byte-identical to dev:
19/19 migrations apply cleanly to an empty database, and the diff returns
**zero** in all three directions (dev-only, files-only, differing definitions),
448 inventory rows matching on both sides.

Closed by applying `008` and `011` to dev (never previously run), adding
`019_reconciliation`, and renaming `schema.sql` to `001_base_schema.sql`.

**The follow-up that prevents a recurrence is item 12 — not a blocker, but the
root cause.**

<details>
<summary>Original blocker notes (superseded)</summary>

**Nothing deploys until this is done.** The migration files, the live dev
database, and the code have diverged in *three independent directions*. A fresh
production database built from the files would be missing columns the code
references, and the failure mode is a 500 on a payment route — money paths
failing at runtime, not a build error that stops the deploy.

This is a systemic problem, not a one-off. Three distinct classes, all found the
hard way during Phase 4:

**(a) Files ahead of the DB — declared, never applied.** `008_strikes.sql`
declares 9 columns and has never been run. The no-show route, the item-dispute
route and `issueStrike` have therefore **never once executed successfully**. On
deploy the file *would* run, so production gets a schema dev never tested
against.

**(b) DB ahead of the files — columns backed by no migration at all.** The live
`orders` table carried `refund_id`, `refund_amount_cents` and
`refund_initiated_by`, none of which appear in any migration file. `refund_id`
also collided with the code's `stripe_refund_id`, so the same concept existed
under two names in two places. Reconciled in `017`, but only because a refund
failed and we went looking.

**(c) Declared but never populated.** `016` added `orders.stripe_charge_id` and
nothing wrote it, so every real order had the column sitting null. Invisible to
a schema diff — the column exists and matches the file — and only surfaced when
`releaseOrder` needed the value.

**Cost so far:** four separate rounds of "add one more missing column", a refund
that reported `order_not_found` when the real cause was a PostgREST 400 from a
missing column, a dispute-record write that failed silently for an entire phase,
and `/admin/disputes` 500ing on its first load.

**Every table the payment and dispute flows touch needs this audit, not just
`orders`.** As of 2026-08-03 the state was:

| Table | Status |
|---|---|
| `orders` | ✅ reconciled by migration 017 |
| `listings` | ✅ complete |
| `meetups` | ❌ 6 columns missing (008) — no-show and item-dispute fields |
| `users` | ❌ 3 columns missing (008) — strike/suspension state |
| `strikes` | ❌ 3 columns missing (008) — `type`, `issued_by`, `notes` |

All 12 belong to `008_strikes.sql`. **Note that 008 as written contains
`DROP TABLE IF EXISTS strikes CASCADE`** — a destructive statement in the middle
of a migration that is otherwise additive. That is almost certainly why it kept
being skipped, and it is exactly the kind of thing the reconciliation pass must
find: a migration nobody wants to run is a migration that silently does not run.
The reconciliation should rewrite it as an additive migration (add the three
columns, drop `NOT NULL` from the legacy `reason`) so the file set can be
applied to a fresh database end to end without a human deciding to skip a step.

**How to apply:**

1. Dump the live dev schema (`pg_dump --schema-only`, or Supabase → Database →
   Schema).
2. Run `001` → `017` in order against a scratch database.
3. Diff. Every difference is a missing migration, an unapplied one, or an
   orphan column.
4. Separately, grep the code for every column it reads or writes per table, and
   confirm each is (i) declared in a file **and** (ii) actually populated by the
   code that owns it. Class (c) is invisible to a schema diff and needs this
   pass.
5. Resolve orphans explicitly: `refund_initiated_by` is currently unused —
   either wire it up or drop it. Don't leave it undecided.
6. **Acceptance test:** a fresh database plus the ordered file set must equal
   the dev schema exactly. Not "looks right" — diff it.
7. Prevent recurrence: adopt tracked migrations (a `schema_migrations` table or
   the Supabase CLI with `supabase db push`) so an unapplied file cannot sit
   unnoticed for four phases. The root cause is that hand-pasting into the SQL
   Editor records nothing about what has run.

Do this **after Phase 4 code is complete and before any production deploy.**

</details>

---

## 🟡 12. Adopt tracked migrations — the root cause of item 1

**Not a deploy blocker, but the reason item 1 happened at all.**

Migrations are applied by hand-pasting into the Supabase SQL Editor, and
**nothing records which have run**. That is how `008_strikes.sql` was skipped
in roughly April and only surfaced in August, four phases later, when the
release sweep needed one of its columns — and how `016` ended up applied three
columns at a time across several sessions, leaving `008` in a state where "is
it applied?" had no yes/no answer.

The reconciliation fixed the *symptom*. Without this, the same drift accrues
again from the next migration onward.

**Two options, either is sufficient:**

1. **`schema_migrations` table.** Each file ends with
   `insert into schema_migrations (version) values ('019') on conflict do nothing;`
   and every file begins by checking it hasn't already run. Cheap, no tooling,
   works with the current hand-paste workflow.
2. **Supabase CLI.** `supabase db push` applies only unapplied migrations and
   tracks them itself; `supabase migration list` shows local vs remote at a
   glance. Better long-term, needs Docker for local development.

Either makes an unapplied file visible immediately rather than four phases
later. The `_recon/` tooling can then be retired — with tracked migrations,
`run-migrations.mjs` and `diff.mjs` become a periodic sanity check rather than
an archaeology expedition.

---

## 🔴 2. Rotate the Stripe test keys

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

## ✅ 2b. `users` table RLS — RESOLVED 2026-08-05

Closed by migration `020_users_rls.sql`.

`users` is now `SELECT USING (auth.uid() = id)` — own row only. Everything the
UI needs about *other* people comes from a new `public_profiles` view exposing
exactly nine safe columns: `id`, `full_name`, `avatar_url`, `avg_rating`,
`review_count`, `city`, `is_founding_member`, `created_at`,
`stripe_payouts_enabled`.

Neither layer alone was sufficient: RLS cannot restrict columns, and column
grants cannot vary by row, so "all columns for your own row, safe columns for
everyone else" needs both. The view is `security_invoker = false` and owned by
`postgres`, so it reads the base table with definer rights and is unaffected by
the lockdown.

**Deliberately excluded:** `zipcode`. A postcode is materially more precise
than the city already shown on listing cards. The one place that needed a
seller's zip — meetup-location suggestions on the request page — now computes
server-side via `POST /api/listings/[id]/meetup-suggestions`, which combines
both zips with the service role and returns **only safe zones**. The seller's
zip never reaches the browser.

**Deliberately included:** `stripe_payouts_enabled` — functionally "this
listing is buyable", no personal content, and it gates the buyer's Pay button.

Grants were tightened beyond the migration's first draft: Supabase's default
`GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated` also applied
to the new view, leaving `anon` holding INSERT/UPDATE/DELETE/TRUNCATE on it.
`020` now does `REVOKE ALL` then `GRANT SELECT`.

Verified with the anon key — the same key embedded in the client bundle:

| Check | Before | After |
|---|---|---|
| `users?select=id,email,phone` | real addresses returned | **`[]`** |
| `users?select=stripe_account_id` | readable | **`[]`** |
| `public_profiles?select=id,full_name,city` | n/a | rows returned |
| `listings?select=…seller:public_profiles!seller_id(…)` | n/a | rows with seller objects |

22 joins across 13 files were repointed from `users!` to `public_profiles!`.
Service-role callers (admin pages, API routes, libs, cron) still read `users`
directly and are unaffected.

`reviews` was considered and deliberately left permissive: a review carries no
contact information, and hiding reviews would break seller reputation on every
listing page.

<details>
<summary>Original notes (superseded)</summary>

### `users` table RLS is wide open

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

</details>

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

## ✅ 11. Migration drift — MERGED INTO ITEM 1

Promoted to the top of this document as the number-one pre-deploy blocker. See
item 1 for the full three-class breakdown and the reconciliation method.

<details>
<summary>Original notes (superseded)</summary>

### Migration files have drifted from the live schema

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

</details>

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

## 🟡 14. Realtime connection ceiling — the failure mode is SILENT

**Watch this when concurrent users approach ~400.**

We are on Supabase **Pro: 500 peak concurrent Realtime connections.** Channels
multiplex over a single websocket per client, so the unit of consumption is
**one connection per open tab per logged-in user** — not one per subscription.

The reason this needs watching: **`NotificationBell` lives in `Navbar`, so it is
mounted on every page for every logged-in user.** Every signed-in tab therefore
holds an open socket for as long as it is open, whether or not anything is
happening on screen. There is no page in the app where a logged-in user is not
consuming a connection.

**At the ceiling, new connections simply fail.** There is no error surfaced to
the user and no alert raised on our side — the bell stops updating and messages
stop arriving live, which is indistinguishable from the bug migration 023 fixed.
Someone reports "messages don't appear until I refresh" and the code looks
correct, because it is.

**What to do when it gets close:**
- Watch Dashboard → Reports → Realtime for peak concurrent connections
- Cheapest structural win: stop mounting the bell subscription on pages where it
  is not useful, or gate it behind an idle timeout so backgrounded tabs release
  their socket
- Raising the Pro limit is a support request, not a self-serve setting — so it
  is not a same-day fix under load
- Consider whether `listings` should ever join the publication (deliberately
  held out of 023): its cost scales as new listings × concurrent viewers, which
  makes it the first thing to reconsider under pressure

Also note the Pro Realtime **message** quota (5M/month, counted per recipient).
The bell and chat are per-recipient filtered so they scale linearly with real
activity; a marketplace feed would not.

---

## 🟡 13. No record of what email we sent to whom

**We cannot answer "did we send it, and to what address?" from our own data.**
There is no email log table. `notifications` is the in-app notification centre,
not a send log. Today, answering a user who says they never got an email means
correlating two external systems:

- **Resend dashboard → Emails** — the authoritative delivery record
  (`delivered` / `bounced` / `complained`, or absent entirely, which means we
  never sent it and it is a code bug rather than deliverability)
- **Vercel logs** — `[email:sent] "<subject>" → <address>` from
  `sendOrLog` in `src/lib/notifications/email.ts`

**Why it matters:** both sources expire. Vercel Hobby log retention is short and
Resend's history is finite, so the evidence for a disputed receipt is gone
exactly when a dispute escalates. These are payment receipts and meetup
confirmations — the emails most likely to be argued about.

**Scope when picked up:** a table written by `sendOrLog` recording recipient,
subject, template key, Resend message id, the `from` actually used, and status.
The `from` column matters specifically: it makes a fallback to
`onboarding@resend.dev` queryable after the fact rather than only alertable in
the moment (see the fallback alerting in `email.ts`). A Resend webhook can
later update delivered/bounced status against the stored message id.

**Related, verified clean 2026-08-07:** emails are addressed from
`public.users.email`, which is written once at signup and never synced from
`auth.users`. If the two diverge, login keeps working while every notification
goes to a stale address, and nothing surfaces it. Checked at 19 users: zero
divergent rows, zero auth users without a `public.users` row, no null or
duplicate addresses. Worth re-running as signups scale, since nothing enforces
it:

```sql
select u.email as users_email, a.email as auth_email
from public.users u join auth.users a on a.id = u.id
where u.email is distinct from a.email;
```

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

---

## Moderation (added 2026-08-21, with the pre-ads listing gate)

**15. Admin access is a hardcoded email allowlist.** `src/lib/admin.ts`. Every
admin change is a deploy, and a non-allowlisted address gets a silent
`redirect("/")` that is indistinguishable from "page doesn't exist" -- that
cost an afternoon of debugging on 2026-08-21. Fine at two people; move it to a
`users` column before there is a third.

**16. No durable quota on `/api/analyze-listing`.** The route now requires auth
(it previously accepted anonymous calls and spent Anthropic tokens for anyone
who POSTed images) and carries a per-user hourly ceiling, but the counter lives
in one serverless instance's module scope. The effective platform-wide limit is
that number times however many instances are warm. A real quota needs its own
table.

**17. Edit-after-approval is not re-screened.** A seller can publish innocuous
content, get auto-approved, then edit the title, description, or photos to
something prohibited via `/listings/[id]/edit`, which writes straight to
PostgREST. Re-screening every edit would push queue volume up, which is the one
thing the gate is tuned to avoid, so it was left open deliberately. Options
later: re-screen only when photos change, or screen asynchronously and demote
to `pending_review` on a bad verdict.

**18. Fail-open is a deliberate accepted risk.** When the classifier errors or
times out, the listing publishes with `moderation_verdict = 'error'` rather
than queueing. The alternative -- failing closed -- means one Anthropic blip
queues every listing submitted during ad spend, with a single admin to clear
it. The keyword prescreen still runs during an outage, so the unambiguous cases
are still refused. `/admin/moderation` surfaces these for retroactive sweep and
they are LIVE until swept.

**19. Buyer request never actually reserves a listing.**
`src/app/listings/[id]/request/page.tsx` updates the listing to
`status='pending'`, but the UPDATE policy is `USING (auth.uid() = seller_id)`
and the caller is the BUYER -- so RLS silently rejects it and the return value
is never checked. Listings stay `active` after a request. Pre-existing, found
during the moderation audit, not fixed here.

**20. Seed listings use lowercase sports and an unlisted sport.** The 25 seed
listings carry `sport` values like `baseball`/`golf` while the sport filter
matches exact-case against `SPORTS` in `src/lib/constants.ts` (`Baseball`,
...), which has no `golf` entry at all. Every seed listing is therefore
unreachable through the sport filter pills, and the six golf ones are
unreachable by any sport filter. Also one real listing has an empty `category`
and a `sport` of Baseball on a pair of soccer cleats.

---

# LEGAL — needs a lawyer, ranked

Ordered by exposure, not by discovery date. The first three are live now, with
paid traffic pointing at the giveaway.

**L1. Zero eligible entries, three weeks into a promoted Promotion Period.**
All four listing entries belong to the two founders, whom §2 excludes as Sponsor
personnel. Marking that correctly (migration 033) took the eligible listing pool
to **0**. The only eligible entry of any kind is a single AMOE submission. Ads
are actively promoting a drawing whose eligible pool is one row.

**L2. Can a drawing proceed at all with an empty or single-entry pool, and what
happens on 3 Nov if it is still zero?** The Rules as written do not say. §3 ends
the Promotion at 500 active listings or 3 Nov, whichever comes first. §7 draws
"at random from all eligible entries" — silent on what a drawing means when
there are none, or one. A promotion advertised with a $500 prize that awards
nothing needs an answer decided in advance, not improvised on the day.

**L3. Eligibility is statewide; prize fulfilment is DFW-only.** §2 opens the
Promotion to "legal residents of the State of Texas". §7 says the prize is
"delivered or arranged for pickup within the Dallas–Fort Worth metropolitan
area". Those do not meet. The live AMOE entry is ZIP 78945 (Giddings, ~200 miles
from DFW) and is fully eligible as written — the Rules impose no DFW
restriction, and `isTexasZip()` correctly accepted it. If that entry wins, the
Rules oblige us to award the prize and simultaneously to fulfil it somewhere the
winner does not live. Nothing says who bears the travel. This is a drafting
conflict, not a reason to exclude the entrant.

**L4. §2 family and household members are unenumerated.** The exclusion covers
immediate family (spouse, parent, child, sibling) and household members of
Sponsor personnel. The database cannot know this and deliberately does not
guess — `sponsor_family` and `sponsor_household` reason codes exist and are
unpopulated (migration 034). Shaun has to name people. Until he does, the
exclusion is written but unenforced.

**L5. Nine real users have no recorded terms acceptance.** Three hold active
listings; one is a seller with completed Stripe onboarding. They predate the
terms-acceptance write. Not backfilled — inventing an acceptance date is worse
than the gap. The OAuth callback now records acceptance at next sign-in, which
is the honest moment. Visible as an amber "none" badge on /admin.

**L6. Inline OAuth assent vs the password path's explicit checkbox.** "Continue
with Google" carries conspicuous notice immediately above the button, with
Terms, Privacy and the Official Rules as three separate visible links, and
acceptance is recorded server-side so no account can exist without one. That is
the standard pattern, but it is weaker consent than a ticked box — and the Rules
are incorporated by reference.

**L7. Two overdue §12 material-change notifications.** The privacy policy commits
to notifying users of material changes. Outstanding: the Meta Pixel / ad-tracking
update, and now third-party Google authentication.

**L8. The Official Rules have never been reviewed by a lawyer.** Everything above
is a finding against a document nobody qualified has read.
