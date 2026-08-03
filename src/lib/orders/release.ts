import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import * as Sentry from "@sentry/nextjs";
import { getStripe } from "@/lib/stripe";
import { createNotification } from "@/lib/notifications/inapp";
import { sendTransactionCompleteEmails } from "@/lib/notifications/email";
import { alertCritical } from "@/lib/notifications/alert";
import type { ReleaseReason } from "@/types/database";

/**
 * Payments Phase 3 — the ONE money mover.
 *
 * releaseOrder() is the only place in the codebase that creates a Stripe
 * Transfer. Every rung of the release ladder calls it:
 *   rung 1  buyer confirms receipt            -> /api/orders/[id]/confirm-receipt
 *   rung 2  seller confirmed, buyer silent 24h -> cron sweep
 *   rung 3  7d backstop from the meetup window -> cron sweep
 *   rung 4  disputed order                     -> never released (frozen here)
 *
 * Separate charges and transfers: the buyer's charge already happened in
 * Phase 2 and the funds sit on NearGear's platform balance. This is the
 * transfer leg only — no destination charges, no application_fee_amount.
 *
 * THREE INDEPENDENT DEFENCES AGAINST A DOUBLE PAYOUT
 *   1. CAS claim   — 'paid_held' -> 'releasing' is a conditional UPDATE. Two
 *                    concurrent callers cannot both win, so only one ever
 *                    reaches the Stripe call.
 *   2. Idempotency — a stable per-order key means a retry after a dropped
 *                    connection returns Stripe's original transfer instead of
 *                    creating a second one. Keys expire after ~24h, so a
 *                    cross-day retry is covered by (3) instead.
 *   3. Recovery    — before any retry we ask Stripe whether a transfer for
 *                    this order already exists and adopt it if so. This is
 *                    what protects the "we sent it, never saw the response,
 *                    and the key has since expired" case.
 *   The unique index on orders.stripe_transfer_id (mig 015) backstops all three
 *   at the database level.
 *
 * MONEY DERIVATION — the payout is computed ONLY from columns written
 * server-side at checkout (orders.item_price_cents / seller_fee_cents, from
 * computeOrderBreakdown). It is never read from `transactions`, never
 * recomputed from a fee helper, and never influenced by anything the client
 * sends. The old completion path computed fees in the browser; nothing here
 * trusts that path.
 */

/** Give up auto-retrying after this many failed transfer attempts. */
export const MAX_TRANSFER_ATTEMPTS = 5;

export type ReleaseSkipReason =
  | "order_not_found"
  | "not_claimable" // wrong status, already released, or claimed by someone else
  | "disputed"
  | "attempts_exhausted"
  | "seller_not_connected"
  | "invalid_amount";

export type ReleaseResult =
  | {
      ok: true;
      outcome: "released";
      orderId: string;
      transferId: string;
      payoutCents: number;
      /** True when we adopted a transfer from an earlier attempt rather than creating one. */
      recovered: boolean;
    }
  | { ok: true; outcome: "skipped"; orderId: string; reason: ReleaseSkipReason }
  | {
      ok: false;
      outcome: "failed";
      orderId: string;
      error: string;
      attempts: number;
      /** True once attempts hit the cap — the order is parked in 'release_failed'. */
      exhausted: boolean;
    };

interface OrderRow {
  id: string;
  meetup_id: string | null;
  listing_id: string | null;
  buyer_id: string | null;
  seller_id: string | null;
  item_price_cents: number;
  seller_fee_cents: number;
  gross_captured_cents: number;
  currency: string;
  status: string;
  stripe_payment_intent_id: string | null;
  /** Persisted by the checkout webhook; null on orders predating that. */
  stripe_charge_id: string | null;
  stripe_transfer_id: string | null;
  disputed_at: string | null;
  transfer_attempts: number;
}

const ORDER_SELECT =
  "id, meetup_id, listing_id, buyer_id, seller_id, item_price_cents, " +
  "seller_fee_cents, gross_captured_cents, currency, status, " +
  "stripe_payment_intent_id, stripe_charge_id, stripe_transfer_id, " +
  "disputed_at, transfer_attempts";

function transferGroup(orderId: string): string {
  return `order_${orderId}`;
}

/**
 * Resolve the charge behind the order's PaymentIntent.
 *
 * Passing it as `source_transaction` makes the transfer draw directly from that
 * charge rather than from the platform's available balance — which is what
 * stops a release fired seconds after checkout from failing with
 * balance_insufficient while the funds are still pending. Best-effort: if we
 * cannot resolve it we fall back to a balance-funded transfer, which is still
 * correct, just subject to funds having settled.
 */
async function resolveSourceCharge(
  stripe: Stripe,
  paymentIntentId: string | null,
): Promise<string | null> {
  if (!paymentIntentId) return null;
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    const latest = pi.latest_charge;
    if (!latest) return null;
    return typeof latest === "string" ? latest : latest.id;
  } catch (err) {
    console.warn(
      `[release] could not resolve source charge for ${paymentIntentId}`,
      err,
    );
    return null;
  }
}

/**
 * Has a transfer for this order already landed at Stripe? Called before a
 * RETRY only. Returns the existing transfer, or null if there is none.
 *
 * A lookup failure returns undefined, which the caller treats as "unknown" and
 * aborts rather than risking a second transfer.
 */
async function findExistingTransfer(
  stripe: Stripe,
  orderId: string,
): Promise<Stripe.Transfer | null | undefined> {
  try {
    const list = await stripe.transfers.list({
      transfer_group: transferGroup(orderId),
      limit: 1,
    });
    return list.data[0] ?? null;
  } catch (err) {
    console.error(`[release] transfer lookup failed for order ${orderId}`, err);
    Sentry.captureException(err);
    return undefined;
  }
}

/**
 * Release a captured order's payout to the seller's connected account.
 *
 * Never throws — every outcome comes back as a ReleaseResult so route handlers
 * and the cron sweep can report without try/catch. Safe to call on an order
 * that is already released, disputed, or mid-flight: those return
 * { outcome: "skipped" }.
 */
export async function releaseOrder(
  admin: SupabaseClient,
  orderId: string,
  reason: ReleaseReason,
): Promise<ReleaseResult> {
  const skip = (reason: ReleaseSkipReason): ReleaseResult => ({
    ok: true,
    outcome: "skipped",
    orderId,
    reason,
  });

  // ---- Preflight -----------------------------------------------------------
  // Cheap rejections before we claim anything. The CAS below re-checks the two
  // conditions that matter (status + dispute), so a race here is harmless.
  const { data, error: loadErr } = await admin
    .from("orders")
    .select(ORDER_SELECT)
    .eq("id", orderId)
    .maybeSingle();

  if (loadErr || !data) {
    console.error(`[release] order ${orderId} not found`, loadErr);
    return skip("order_not_found");
  }
  const order = data as unknown as OrderRow;

  if (order.disputed_at) return skip("disputed");
  if (order.status !== "paid_held") return skip("not_claimable");
  if (order.transfer_attempts >= MAX_TRANSFER_ATTEMPTS)
    return skip("attempts_exhausted");

  // Seller must have a connected account to transfer to. We deliberately do NOT
  // gate on stripe_payouts_enabled: that governs payouts to their bank, while a
  // transfer only needs to reach their Stripe balance. Stripe is the authority
  // on whether the transfer can land — a rejection retries like any other.
  const { data: sellerRow } = await admin
    .from("users")
    .select("id, stripe_account_id, email, full_name")
    .eq("id", order.seller_id ?? "")
    .maybeSingle();
  const seller = sellerRow as {
    id: string;
    stripe_account_id: string | null;
    email: string;
    full_name: string | null;
  } | null;

  if (!seller?.stripe_account_id) {
    console.error(`[release] order ${orderId}: seller has no connected account`);
    return skip("seller_not_connected");
  }

  // ---- Amount --------------------------------------------------------------
  // Server-written cents only. Both operands were set by the checkout route
  // from computeOrderBreakdown; nothing here re-derives a fee.
  const payoutCents = order.item_price_cents - order.seller_fee_cents;
  if (
    !Number.isInteger(payoutCents) ||
    payoutCents <= 0 ||
    payoutCents > order.gross_captured_cents
  ) {
    console.error(
      `[release] order ${orderId}: refusing implausible payout ${payoutCents} ` +
        `(item=${order.item_price_cents} fee=${order.seller_fee_cents} gross=${order.gross_captured_cents})`,
    );
    Sentry.captureMessage(`[release] implausible payout for order ${orderId}`);
    return skip("invalid_amount");
  }

  // ---- CAS claim -----------------------------------------------------------
  // The whole concurrency story. Only the caller that flips 'paid_held' ->
  // 'releasing' proceeds; everyone else sees zero rows and skips. The dispute
  // check is re-asserted here so a dispute filed between load and claim wins.
  const { data: claimed, error: claimErr } = await admin
    .from("orders")
    .update({
      status: "releasing",
      transfer_attempts: order.transfer_attempts + 1,
      release_reason: reason,
    })
    .eq("id", orderId)
    .eq("status", "paid_held")
    .is("disputed_at", null)
    .select("id, transfer_attempts")
    .maybeSingle();

  if (claimErr || !claimed) {
    // Lost the race, or a dispute landed first. Not an error.
    return skip("not_claimable");
  }
  const attempts = (claimed as { transfer_attempts: number }).transfer_attempts;

  // Hand the order back for a later retry. Money did NOT move on this path.
  const failAndRelease = async (message: string): Promise<ReleaseResult> => {
    const exhausted = attempts >= MAX_TRANSFER_ATTEMPTS;
    await admin
      .from("orders")
      .update({
        // Back to 'paid_held' so the next daily sweep retries. Only park it in
        // 'release_failed' once attempts are spent — a transient Stripe error
        // must be a delay, never a stranded payout.
        status: exhausted ? "release_failed" : "paid_held",
        transfer_error: message.slice(0, 500),
      })
      .eq("id", orderId)
      .eq("status", "releasing");
    console.error(
      `[release] order ${orderId} attempt ${attempts} failed: ${message}` +
        (exhausted ? " (attempts exhausted — parked)" : ""),
    );
    if (exhausted) {
      // Money-critical: the seller's payout has stopped retrying and is now
      // stuck behind a human. Funds are still safely held on the platform.
      await alertCritical({
        event: "release_failed_exhausted",
        summary: `Order ${orderId} failed to release after ${attempts} attempts — seller is unpaid and auto-retry has stopped.`,
        details: {
          orderId,
          meetupId: order.meetup_id,
          sellerId: order.seller_id,
          payoutCents,
          attempts,
          lastError: message,
          action: "Funds are still held on the platform. Investigate, then reset orders.status to 'paid_held' and transfer_attempts to 0 to resume auto-retry.",
        },
      });
    }
    return { ok: false, outcome: "failed", orderId, error: message, attempts, exhausted };
  };

  const stripe = getStripe();

  try {
    // ---- Recover an orphaned transfer from a previous attempt --------------
    let transfer: Stripe.Transfer | null = null;
    let recovered = false;
    if (attempts > 1) {
      const existing = await findExistingTransfer(stripe, orderId);
      if (existing === undefined) {
        // Lookup itself failed — we cannot rule out an earlier success, so we
        // must not create another transfer. Retry next sweep.
        return failAndRelease("transfer lookup failed; not risking a duplicate");
      }
      if (existing) {
        transfer = existing;
        recovered = true;
        console.warn(
          `[release] order ${orderId}: adopted existing transfer ${existing.id} from a prior attempt`,
        );
      }
    }

    // ---- Create the transfer ----------------------------------------------
    if (!transfer) {
      // Prefer the charge persisted at checkout; only call Stripe if this order
      // predates that (or the webhook couldn't resolve it).
      const sourceCharge =
        order.stripe_charge_id ??
        (await resolveSourceCharge(stripe, order.stripe_payment_intent_id));
      transfer = await stripe.transfers.create(
        {
          amount: payoutCents,
          currency: order.currency || "usd",
          destination: seller.stripe_account_id,
          transfer_group: transferGroup(orderId),
          ...(sourceCharge ? { source_transaction: sourceCharge } : {}),
          metadata: {
            order_id: orderId,
            meetup_id: order.meetup_id ?? "",
            release_reason: reason,
          },
        },
        { idempotencyKey: `release_${orderId}` },
      );
    }

    // ---- Money has moved. Record it before anything else can fail. ---------
    const releasedAt = new Date().toISOString();
    const { error: markErr } = await admin
      .from("orders")
      .update({
        status: "released",
        stripe_transfer_id: transfer.id,
        released_at: releasedAt,
        release_reason: reason,
        transfer_error: null,
      })
      .eq("id", orderId);

    if (markErr) {
      // The transfer succeeded but we could not record it. Do NOT revert the
      // order — that would invite a second transfer. The order is stranded in
      // 'releasing', which no sweep will claim, so this needs a human.
      //
      // alertCritical is deliberately used here rather than Sentry alone: this
      // fires precisely BECAUSE a database write just failed, so any
      // database-backed alert channel is unreliable at this exact moment.
      await alertCritical({
        event: "transfer_unrecorded",
        summary: `Stripe transfer ${transfer.id} SUCCEEDED but order ${orderId} could not be marked released. Money moved; the database does not know.`,
        details: {
          orderId,
          transferId: transfer.id,
          meetupId: order.meetup_id,
          sellerId: order.seller_id,
          payoutCents,
          dbError: markErr.message,
          action: `Do NOT re-run release. Set orders.status='released', stripe_transfer_id='${transfer.id}', released_at=now() for order ${orderId}.`,
        },
      });
    }

    // Downstream ledger/UI state. Failures here never unwind the payout.
    await projectRelease(admin, order, {
      payoutCents,
      reason,
      releasedAt,
      seller,
    });

    console.log(
      `[release] order ${orderId} released ${payoutCents}c to ${seller.stripe_account_id} ` +
        `via ${transfer.id} (${reason}${recovered ? ", recovered" : ""})`,
    );
    return {
      ok: true,
      outcome: "released",
      orderId,
      transferId: transfer.id,
      payoutCents,
      recovered,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "unknown transfer error";
    Sentry.captureException(err);
    return failAndRelease(message);
  }
}

/**
 * Project a released order onto the rest of the app: meetup completed, listing
 * sold, ledger row written, both parties notified.
 *
 * `transactions` is a PROJECTION of the order — every cent copied from columns
 * the server wrote. Under the flat model gross_amount is the item price,
 * platform_fee is the seller fee, and net_amount is the payout; the buyer fee
 * is platform revenue and stays on the order.
 *
 * Idempotent: the unique index on transactions.meetup_id (mig 015) means a
 * re-run hits 23505, which we treat as "already projected" rather than an error.
 * Nothing in here throws — the payout has already happened and must not be
 * unwound by a ledger hiccup.
 */
async function projectRelease(
  admin: SupabaseClient,
  order: OrderRow,
  ctx: {
    payoutCents: number;
    reason: ReleaseReason;
    releasedAt: string;
    seller: { id: string; email: string; full_name: string | null };
  },
): Promise<void> {
  const { payoutCents, reason, releasedAt, seller } = ctx;
  const autoCompleted = reason !== "buyer_confirmed";

  try {
    if (order.meetup_id) {
      // The mig-015 trigger allows this: the order is 'released' by now.
      const { error: meetupErr } = await admin
        .from("meetups")
        .update({
          status: "completed",
          completed_at: releasedAt,
          auto_completed: autoCompleted,
        })
        .eq("id", order.meetup_id)
        .neq("status", "completed");
      if (meetupErr) {
        console.error(
          `[release] meetup ${order.meetup_id} completion failed`,
          meetupErr,
        );
        Sentry.captureException(meetupErr);
      }
    }

    if (order.listing_id) {
      await admin
        .from("listings")
        .update({ status: "sold" })
        .eq("id", order.listing_id);
    }

    // retail_price is display-only (the buyer's "you saved $X" line).
    let retailPrice: number | null = null;
    if (order.listing_id) {
      const { data: listing } = await admin
        .from("listings")
        .select("retail_price, title")
        .eq("id", order.listing_id)
        .maybeSingle();
      retailPrice =
        (listing as { retail_price: number | null } | null)?.retail_price ?? null;
    }

    const { data: tx, error: txErr } = await admin
      .from("transactions")
      .insert({
        meetup_id: order.meetup_id,
        listing_id: order.listing_id,
        buyer_id: order.buyer_id,
        seller_id: order.seller_id,
        order_id: order.id,
        gross_amount: order.item_price_cents,
        platform_fee: order.seller_fee_cents,
        net_amount: payoutCents,
        retail_price: retailPrice,
        auto_completed: autoCompleted,
      })
      .select("id")
      .maybeSingle();

    if (txErr) {
      // 23505 = unique violation on meetup_id: already projected. Benign.
      if (txErr.code === "23505") {
        console.log(
          `[release] order ${order.id}: ledger row already exists, skipping`,
        );
        return;
      }
      console.error(`[release] ledger insert failed for order ${order.id}`, txErr);
      Sentry.captureException(txErr);
      return;
    }

    await notifyReleased(admin, order, {
      transactionId: (tx as { id: string } | null)?.id ?? null,
      payoutCents,
      seller,
    });
  } catch (err) {
    console.error(`[release] projection failed for order ${order.id}`, err);
    Sentry.captureException(err);
  }
}

/**
 * Completion emails + in-app notifications.
 *
 * Called directly rather than via /api/notifications/trigger: that route
 * requires an authenticated participant, and the cron sweeps run with no user
 * session. Both helpers below swallow their own failures.
 */
async function notifyReleased(
  admin: SupabaseClient,
  order: OrderRow,
  ctx: {
    transactionId: string | null;
    payoutCents: number;
    seller: { id: string; email: string; full_name: string | null };
  },
): Promise<void> {
  const { transactionId, payoutCents, seller } = ctx;

  const { data: buyerRow } = await admin
    .from("users")
    .select("id, email, full_name")
    .eq("id", order.buyer_id ?? "")
    .maybeSingle();
  const buyer = buyerRow as {
    id: string;
    email: string;
    full_name: string | null;
  } | null;

  const { data: listingRow } = await admin
    .from("listings")
    .select("title")
    .eq("id", order.listing_id ?? "")
    .maybeSingle();
  const listingTitle =
    (listingRow as { title: string } | null)?.title ?? "your item";

  await Promise.all([
    createNotification({
      userId: seller.id,
      type: "transaction_complete",
      title: "Payment released 💰",
      body: `$${(payoutCents / 100).toFixed(2)} for ${listingTitle} is on its way to your account.`,
      link: transactionId ? `/profile/transactions/${transactionId}` : "/profile/wallet",
    }),
    createNotification({
      userId: order.buyer_id,
      type: "transaction_complete",
      title: "Purchase complete 🎉",
      body: `Your purchase of ${listingTitle} is complete. Thanks for using NearGear.`,
      link: transactionId ? `/profile/transactions/${transactionId}` : "/profile/transactions",
    }),
    buyer && transactionId
      ? sendTransactionCompleteEmails({
          buyer: { email: buyer.email, fullName: buyer.full_name },
          seller: { email: seller.email, fullName: seller.full_name },
          transactionId,
          meetupId: order.meetup_id ?? "",
          listingTitle,
          grossAmount: order.item_price_cents,
          platformFee: order.seller_fee_cents,
          netAmount: payoutCents,
          retailPrice: null,
        })
      : Promise.resolve(),
  ]);
}
