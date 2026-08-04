# Payments Phase 4 — refunds & dispute resolution runbook (TEST MODE)

Phase 3 froze orders on cancel / no-show / dispute but had nowhere to send
them, so held funds sat at `paid_held` forever. Phase 4 resolves them: a **full**
refund to the buyer (item + Buyer Protection fee), or a release to the seller.

**Scope: pre-release only.** Once funds have transferred, `refundOrder` hard-
refuses with `manual_reversal_required` and the transfer id. Reversal is manual
in the Stripe dashboard.

## The trigger model

| Trigger | Outcome |
|---|---|
| Buyer cancels **>24h** before the window | auto-refund |
| **Seller** cancels, any time | auto-refund |
| **Seller** no-show (buyer reports) | auto-refund |
| Buyer cancels **<24h** before | freeze → admin review |
| **Buyer** no-show (seller reports) | freeze → admin review |
| Item dispute | freeze → admin review |

Admin review is **binary**: full refund to the buyer, or full payout to the
seller. Partial splits are deliberately not modelled.

## Prerequisites

1. Migrations `016`, `017`, `018` applied, plus `008`'s **meetups** columns.
   See RECONCILIATION.md — `008` is only partially applied, and `011` is not
   applied at all.
2. Stripe test keys in `.env.local`; `stripe listen` running if you want webhook
   events.
3. A seller with a connected account (`stripe_account_id` set).
4. `npx next dev` — **restart it after pulling**, since a stale server serving
   old routes has repeatedly produced false failures.

> The `/api/dev/*` harnesses used during development (`mint-order`, `refund`,
> `trigger`) were deleted at the end of Phase 4. The flows below run through the
> real UI. To recreate a paid subject, run the Phase 2 checkout flow.

## Verify outcomes in SQL, not from the response

Routes return HTTP 200 with a failure body. Check state:

```sql
select o.status, o.freeze_reason, o.disputed_at,
       o.stripe_refund_id, o.refund_amount_cents, o.refund_reason,
       o.stripe_transfer_id, o.release_reason,
       o.dispute_resolution, o.dispute_resolved_by,
       o.refund_attempts, o.refund_error, o.transfer_attempts, o.transfer_error,
       m.status as meetup_status, l.status as listing_status
from orders o
left join meetups m on m.id = o.meetup_id
left join listings l on l.id = o.listing_id
where o.id = '<ORDER_ID>';
```

---

## 1. Auto-refund: buyer cancels outside 24h

Meetup window >24h out. As the **buyer**, open `/meetups/<id>/cancel`.

Copy must read *"you'll be refunded in full"*. Submit.

**Expect:** `status=refunded` · `stripe_refund_id=re_…` · `refund_amount_cents`
= the full captured amount · `refund_reason=cancelled` · listing `active` ·
meetup `cancelled_buyer`. Stripe shows the charge **Refunded** for the full
amount — item **and** Buyer Protection fee.

## 2. Auto-refund: seller no-show

Window has passed, meetup still `scheduled`. As the **buyer**, open
`/meetups/<id>/no-show` and report the **seller** didn't show.

**Expect:** `refunded`, `refund_reason=seller_no_show`, meetup
`no_show_seller`.

## 3. Freeze: buyer cancels inside 24h

Window <24h out. As the **buyer**, cancel.

Copy must read *"reviewed before a refund is issued"* — **not** an instant
refund promise.

**Expect:** `status=paid_held` · **no refund** · `disputed_at` set ·
`freeze_reason=cancelled_late`. Confirm no refund exists on the charge in
Stripe. The case appears in `/admin/disputes`.

## 4. Freeze: buyer no-show

As the **seller**, report the **buyer** didn't show.

**Expect:** `paid_held`, no refund, `freeze_reason=no_show`, meetup
`no_show_buyer`, case in `/admin/disputes`.

## 5. Freeze: item dispute

As the **buyer**, report a problem from the meetup page.

**Expect:** `paid_held`, `freeze_reason=item_dispute`, meetup `item_dispute`
with `item_dispute_reason` / `item_dispute_notes` persisted.

> If the dispute record fails to save, the route returns **500
> `dispute_not_recorded`** and the funds are still frozen. That ordering is
> deliberate: money stops before bookkeeping.

---

## 6. Admin: refund the buyer

`/admin/disputes` as an admin. Each card shows both amounts — the refund
(incl. buyer fee) and the payout (after seller fee).

Click **Refund buyer**, confirm.

**Expect:** `refunded` · `re_…` · `refund_reason=dispute_upheld` ·
`dispute_resolution=refund_buyer` · `dispute_resolved_by` = the admin's user id
· listing `active`. `disputed_at` **stays set** — that is intentional history;
the case leaves the queue because `status` is no longer `paid_held`.

## 7. Admin: release to the seller

Click **Release to seller**, confirm.

**Expect:** `released` · **`disputed_at` NULL** ← the unfreeze ·
`stripe_transfer_id=tr_…` · `release_reason=admin_release` ·
`dispute_resolution=release_seller` · `dispute_resolved_by` set ·
`transfer_attempts=1`. One new transfer in Stripe → Connect → Transfers.

`disputed_at` being NULL alongside a real `tr_…` is the assertion that matters:
it proves the unfreeze happened before the transfer, not after.

## 8. The half-applied guard (worth running once)

Releasing requires unfreezing first, which opens a window where the release can
still refuse. Prove it fails safely.

Restore a resolved order to a frozen state, then remove `admin_release` from
the CHECK:

```sql
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_release_reason_check;
ALTER TABLE orders ADD CONSTRAINT orders_release_reason_check CHECK (
  release_reason IS NULL OR release_reason IN
    ('buyer_confirmed','seller_24h','backstop_7d'));
NOTIFY pgrst, 'reload schema';
```

Click **Release to seller**.

**Expect:** *"Release did not run (claim_failed). Nothing was transferred and
the hold is still in place, so the case stays in the queue."* — and in SQL the
order is still `paid_held` with `disputed_at` **set** and `dispute_resolution`
**NULL**. Nothing half-applied, case still visible.

Re-apply `018` afterwards.

---

## 9. Guards to spot-check

| Guard | How | Expect |
|---|---|---|
| Post-release refund | Release an order, then cancel/report it | `manual_reversal_required` with the `tr_…`; **no refund attempted**; appears under "Needs manual reversal" in `/admin/disputes` |
| Refund idempotency | Refund the same order twice | second is `already_refunded`, one `re_…` in Stripe |
| Refund recovery | Null `stripe_refund_id`, set `refund_attempts=1`, retry | adopts the existing refund, `recovered: true`, still one `re_…` |
| Mutual exclusion | Release an already-refunded order | skipped, no transfer |
| Admin auth | POST `/api/admin/disputes/<id>/resolve` logged out | **403** |
| Sweep ignores frozen | Freeze an otherwise-eligible order, run `?dry=1` | `releaseEligible: 0` |

## 10. Money math

On a $38.00 item: buyer pays **$41.80** ($38.00 + $3.80 fee). A full refund
returns **$41.80** — the platform keeps nothing and absorbs Stripe's processing
fee (~$1.51), which is deliberate. A release pays the seller **$34.20**
($38.00 − $3.80).

## What can't be tested locally

The daily cron firing on schedule. `vercel.json` registers it, but Vercel only
does so from a production deployment. Confirm on first deploy that the job
appears, fires, and that `checkCronAuth` accepts Vercel's
`Authorization: Bearer $CRON_SECRET`.
