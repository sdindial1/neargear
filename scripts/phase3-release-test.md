# Payments Phase 3 — fund release test runbook (TEST MODE)

Picks up where Phase 2 left off: an order sitting at `paid_held` with the full
amount captured on NearGear's platform balance. Phase 3 transfers the seller's
cut to their connected account when the handoff is confirmed.

**Release ladder**

| Rung | Trigger | Result |
|---|---|---|
| 1 | Buyer confirms receipt | Immediate release |
| 2 | Seller confirms, buyer silent 24h | Release via cron sweep |
| 3 | Neither confirms, 7d from meetup window | Release via cron sweep |
| 4 | Dispute / no-show / cancel | Frozen — never auto-released |

Absent a freeze, funds always end with the seller. Refunds and dispute
resolution are Phase 4 and are NOT in this runbook.

## Prerequisites

1. Migration `015_release.sql` applied in the Supabase SQL Editor.
2. Phase 2 prerequisites still hold (Stripe test keys, `stripe listen`).
3. A seller with completed Connect onboarding (`stripe_account_id` set).
4. At least one order at `paid_held` — run the Phase 2 runbook to create one.
5. `npx next dev`

The cron endpoint needs no auth locally: `checkCronAuth` bypasses when
`NODE_ENV !== "production"`.

## The reset script

Every timing test below needs a clean starting state. Change the first line to
retarget; safe to re-run.

```sql
DO $$
DECLARE
  target_order_id UUID := '<order id>';
  v_meetup_id  UUID;
  v_listing_id UUID;
BEGIN
  SELECT meetup_id, listing_id INTO v_meetup_id, v_listing_id
  FROM orders WHERE id = target_order_id;

  IF v_meetup_id IS NULL AND v_listing_id IS NULL THEN
    RAISE EXCEPTION 'order % not found', target_order_id;
  END IF;

  DELETE FROM transactions WHERE order_id  = target_order_id;
  DELETE FROM transactions WHERE meetup_id = v_meetup_id;

  UPDATE meetups
     SET status = 'scheduled', completed_at = NULL, auto_completed = false,
         buyer_completed_at = NULL, seller_completed_at = NULL
   WHERE id = v_meetup_id;

  UPDATE listings SET status = 'active' WHERE id = v_listing_id;

  UPDATE orders
     SET status = 'paid_held',
         buyer_confirmed_at = NULL, seller_confirmed_at = NULL,
         buyer_notified_at = NULL, released_at = NULL, release_reason = NULL,
         stripe_transfer_id = NULL, disputed_at = NULL,
         transfer_error = NULL, transfer_attempts = 0
   WHERE id = target_order_id;
END $$;
```

Verify state at any point:

```sql
select o.status, o.transfer_attempts, o.release_reason, o.released_at,
       o.stripe_transfer_id, o.buyer_confirmed_at, o.seller_confirmed_at,
       o.buyer_notified_at, o.disputed_at, o.transfer_error,
       m.status as meetup_status, l.status as listing_status,
       (select count(*) from transactions t where t.order_id = o.id) as ledger_rows
from orders o
left join meetups m  on m.id = o.meetup_id
left join listings l on l.id = o.listing_id
where o.id = '<order id>';
```

## Rung 1 — buyer confirms (the common path)

1. Reset. Log in as the **buyer**, open `/meetups/<id>`.
2. Tap **I Received the Item** → confirm in the dialog.
3. Expect the celebration view.

**Verify**
- `orders`: `released`, `release_reason = 'buyer_confirmed'`, `transfer_attempts = 1`,
  `stripe_transfer_id` set, `transfer_error` null.
- `transactions`: one row, `gross_amount` = item price, `platform_fee` = seller
  fee, `net_amount` = payout, `order_id` set, `auto_completed = false`.
- `meetups` → `completed`; `listings` → `sold`.
- Stripe → Connect → Transfers: exactly one transfer for the payout amount.
- Seller's notifications: **"Payment released 💰"**.

**Idempotency:** tap again (or re-POST) → `409 already_released`, no second
transfer.

## Rung 2 — seller confirms, buyer silent 24h

1. Reset. As the **seller**, tap **I Handed Off the Item**.
2. Expect "waiting on the buyer" and **no money movement**
   (`stripe_transfer_id` still null).
3. Verify the buyer got both notices: in-app **"Seller marked the handoff
   complete"** and the email *"Confirm you received … — 24 hours"*. Without
   `RESEND_API_KEY` the terminal logs `[email:skip]`.
4. Confirm `seller_confirmed_at` and `buyer_notified_at` are both stamped.

**Double-tap:** tap again → `already_confirmed`, and `buyer_notified_at` must be
**unchanged** — the clock does not restart and no second email goes out.

**Negative (proves never-early):**
```sql
update orders set buyer_notified_at = now() - interval '23 hours' where id = '<order id>';
```
```powershell
irm "http://localhost:3000/api/cron/expire-requests" | ConvertTo-Json -Depth 5
```
→ `releaseEligible: 0`. Nothing released.

**Positive:**
```sql
update orders set buyer_notified_at = now() - interval '25 hours' where id = '<order id>';
```
→ `released: 1`, `releaseByReason: { seller_24h: 1 }`, and the same projection
checks as rung 1 but with `auto_completed = true`.

## Rung 3 — 7-day backstop

1. Reset. No confirmations from either side.
2. Negative: `update meetups set meetup_window_start = now() - interval '6 days' where id = '<meetup id>';`
   → sweep releases nothing.
3. Positive: `interval '8 days'` → `releaseByReason: { backstop_7d: 1 }`.

## Rung 4 — freezes

Each of these must leave the money untouched. Reset before each.

| Case | Setup | Expect |
|---|---|---|
| Item dispute | Buyer taps **report a problem** | `disputed_at` set; sweep `releaseEligible: 0` |
| No-show | Either party reports a no-show | `disputed_at` set; even with the window backdated 8 days, nothing releases |
| Cancel | Either party cancels a paid meetup | `disputed_at` set, response carries `ordersFrozen: 1`; counterparty is notified |

**Freeze idempotency:** report twice → `disputed_at` unchanged, `ordersFrozen: 0`
the second time.

**Already-released:** release first (rung 1), *then* report a no-show. The
freeze reports `alreadyReleased: true` and the terminal warns that funds are
already with the seller. This is a Phase 4 reversal case, not a bug.

**Belt-and-braces check:** clear `disputed_at` on a no-showed meetup and backdate
the window 8 days. The sweep must *still* refuse, because
`RELEASABLE_MEETUP_STATUSES` only allows `scheduled` / `completed`. Two
independent guards.

## The paid-order invariant

The core money-integrity rule: no meetup completes without captured funds.

- UI: on an unpaid meetup the seller sees "Once the buyer pays…" and **no
  confirm button** is offered to either party.
- Route: POSTing a confirm route for an unpaid order → `409 not_paid`.
- Database: the last line of defence, independent of any code path —
  ```sql
  update meetups set status = 'completed' where id = '<unpaid meetup id>';
  -- ERROR: meetup ... cannot be completed: no captured order
  ```

## Retry behaviour

To simulate a transfer failure, point the seller at a bogus connected account:

```sql
update users set stripe_account_id = 'acct_invalid' where id = '<seller id>';
```

Rung 1 then returns `pending_retry` — the buyer's confirmation is recorded, the
order is back at `paid_held` with `transfer_error` set and `transfer_attempts`
incremented. Restore the real `stripe_account_id` and run the sweep: it retries
and releases. After 5 failed attempts the order parks in `release_failed` and
`alertCritical` fires (email to support@near-gear.com + Sentry).

## What can't be tested locally

**Vercel actually firing the cron on schedule.** `vercel.json` registers a daily
09:00 UTC job, but Vercel only registers crons from a production deployment.
Until then the sweep is verified by invoking the endpoint directly. On the first
production deploy, confirm: the job appears in the Vercel dashboard, it fires,
and `checkCronAuth` accepts Vercel's `Authorization: Bearer $CRON_SECRET`.

Also note Hobby crons run at most once daily and fire approximately, not exactly,
on schedule. That is why every rung compares elapsed time with `>=`: a late run
releases late, never early. Expect rung 2 to land in 24–48h and rung 3 in 7–8
days in production.
