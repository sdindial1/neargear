# Payments Phase 2 — buyer checkout test runbook (TEST MODE)

Full-payment-on-accept flow: buyer offers → seller accepts → buyer pays
(item + 10% Buyer Protection fee) → captured & held on the platform as
`paid_held`. No transfers/refunds yet (Phases 3 & 4).

## Prerequisites
1. Run migration `014_orders.sql` in the Supabase SQL Editor.
2. `.env.local` has `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
   and `STRIPE_WEBHOOK_SECRET` (from `stripe listen`).
3. Webhook forwarder running (same one from Phase 1 — it also delivers
   `checkout.session.completed`):
   ```
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```
4. `npx next dev --port 3000 --hostname 0.0.0.0`

## Accounts
- **Seller** account must have completed Phase 1 onboarding
  (`stripe_payouts_enabled = true`). If not, do the Phase 1 flow first.
- **Buyer** = a second signed-in account.

## Steps
1. As the **seller**, have an active listing.
2. As the **buyer**, open the listing → "Request to buy" → pick an offer,
   time, location → **Send Request to Seller**. (Confirm: no charge here; the
   review screen shows "You won't be charged now" + the item / Buyer Protection
   fee / total breakdown.)
3. As the **seller**, go to Profile → Meetups → Incoming → **Accept** the
   request. Status → `scheduled`.
4. As the **buyer**, open the meetup (`/meetups/<id>`). The **"Pay to lock in
   your meetup"** card shows: item price, Buyer Protection fee, total.
   - Sanity: on a $200 offer, fee = $20.00, total = $220.00.
5. Click **Pay $220.00** → redirected to Stripe Checkout.
6. Pay with test card **4242 4242 4242 4242**, any future expiry, any CVC, any
   ZIP.
7. On success you return to `/meetups/<id>?paid=1`. The card flips to
   **"Paid — held securely by NearGear"** (polls a few seconds for the webhook).

## Verify
- `stripe listen` shows `checkout.session.completed [200]`.
- In Supabase, the `orders` row for this meetup:
  - `status = 'paid_held'`
  - `item_price_cents = 20000`, `buyer_fee_cents = 2000`,
    `seller_fee_cents = 2000` (or `0` if the seller is a founding member)
  - `gross_captured_cents = 22000`
  - `stripe_payment_intent_id` populated, `paid_at` set
- Stripe Dashboard → Payments: a $220.00 charge on the **platform** account
  (NOT a destination/connected-account charge — funds are held on the platform;
  transfer happens in Phase 3).

## Guards to spot-check
- **Seller not connected:** point the buyer at a meetup whose seller has
  `stripe_payouts_enabled = false` → the pay card shows "Checkout not ready
  yet" and `POST /api/stripe/checkout` returns 409 `seller_not_ready`.
- **Not accepted yet:** calling checkout while status is `requested` returns
  409 `not_payable`.
- **Double-pay:** paying an already-`paid_held` meetup returns 409
  `already_paid` (also enforced by the partial unique index on `orders`).

## Founding seller check
If the seller is a founding member: buyer still pays the full $220 (buyer fee
unaffected), but the order's `seller_fee_cents = 0` (seller keeps the full
$200 at payout in Phase 3).
