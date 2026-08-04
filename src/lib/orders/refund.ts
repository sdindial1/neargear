import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import * as Sentry from "@sentry/nextjs";
import { getStripe } from "@/lib/stripe";
import { createNotification } from "@/lib/notifications/inapp";
import { alertCritical } from "@/lib/notifications/alert";
import type { RefundReason } from "@/types/database";

/**
 * Payments Phase 4 — the SECOND money mover.
 *
 * refundOrder() is the only place in the codebase that creates a Stripe
 * refund, exactly as releaseOrder() is the only place that creates a transfer.
 * Callers: the cancel route, the no-show route, and admin dispute resolution.
 *
 * PRE-RELEASE ONLY. If funds have already transferred to the seller this
 * refuses and reports manual_reversal_required — reversing a completed payout
 * is a Stripe-dashboard job at launch, not something to automate blind.
 *
 * MUTUAL EXCLUSION WITH RELEASE — the property that matters most here.
 * Phase 3 had one money mover; this is the second, acting on the same row.
 * The dangerous interleaving is a refund firing while a transfer is in flight:
 * the buyer gets their money back AND the seller gets paid, and unlike a stuck
 * payout that is unrecoverable without chasing the seller.
 *
 * They cannot collide because each claims only states the other can't hold:
 *
 *   releaseOrder   claims  'paid_held'                    -> 'releasing'
 *   refundOrder    claims  'paid_held' | 'release_failed'  -> 'refunding'
 *
 * An order in 'releasing' is unclaimable by refund; an order in 'refunding' is
 * unclaimable by release. Whoever wins the CAS owns the row.
 *
 * Note the deliberate asymmetry: releaseOrder's CAS excludes disputed orders,
 * refundOrder's does NOT. Frozen orders are precisely the ones being refunded.
 */

/** Give up auto-retrying after this many failed refund attempts. */
export const MAX_REFUND_ATTEMPTS = 5;

/** Statuses a refund may claim. 'released'/'releasing' are excluded by design. */
const REFUNDABLE_STATUSES = ["paid_held", "release_failed"];

export type RefundSkipReason =
  /** The lookup itself failed — schema mismatch, connectivity, RLS. NOT "no such row". */
  | "lookup_failed"
  /** The CAS UPDATE errored — constraint violation, schema drift. NOT a lost race. */
  | "claim_failed"
  | "order_not_found"
  | "already_refunded"
  | "release_in_flight" // transfer mid-flight; retry once it settles
  | "not_refundable" // pending/cancelled/failed — nothing captured to return
  | "no_payment_intent"
  | "attempts_exhausted";

export type RefundResult =
  | {
      ok: true;
      outcome: "refunded";
      orderId: string;
      refundId: string;
      amountCents: number;
      /** True when an existing refund was adopted rather than a new one created. */
      recovered: boolean;
    }
  | { ok: true; outcome: "skipped"; orderId: string; reason: RefundSkipReason }
  | {
      ok: false;
      outcome: "manual_reversal_required";
      orderId: string;
      transferId: string | null;
      payoutCents: number;
      message: string;
    }
  | {
      ok: false;
      outcome: "failed";
      orderId: string;
      error: string;
      attempts: number;
      exhausted: boolean;
    };

interface OrderRow {
  id: string;
  meetup_id: string | null;
  listing_id: string | null;
  buyer_id: string | null;
  seller_id: string | null;
  item_price_cents: number;
  buyer_fee_cents: number;
  seller_fee_cents: number;
  gross_captured_cents: number;
  status: string;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  stripe_transfer_id: string | null;
  stripe_refund_id: string | null;
  refund_attempts: number;
  freeze_reason: string | null;
}

const ORDER_SELECT =
  "id, meetup_id, listing_id, buyer_id, seller_id, item_price_cents, " +
  "buyer_fee_cents, seller_fee_cents, gross_captured_cents, status, " +
  "stripe_payment_intent_id, stripe_charge_id, stripe_transfer_id, " +
  "stripe_refund_id, refund_attempts, freeze_reason";

/**
 * Has a refund for this PaymentIntent already landed at Stripe? Called before a
 * RETRY only.
 *
 * Returns the refund, null if none, or undefined if the lookup itself failed —
 * which the caller treats as "unknown" and aborts on, rather than risking a
 * second refund. Same three-state contract as the transfer lookup in release.ts.
 */
async function findExistingRefund(
  stripe: Stripe,
  paymentIntentId: string,
): Promise<Stripe.Refund | null | undefined> {
  try {
    const list = await stripe.refunds.list({
      payment_intent: paymentIntentId,
      limit: 1,
    });
    return list.data[0] ?? null;
  } catch (err) {
    console.error(`[refund] lookup failed for ${paymentIntentId}`, err);
    Sentry.captureException(err);
    return undefined;
  }
}

/**
 * Refund a held order's full payment to the buyer.
 *
 * "Full" means the entire captured amount — item price AND the 10% Buyer
 * Protection fee. The platform keeps nothing and absorbs Stripe's processing
 * fee, which is not returned on refunds. That cost is deliberate.
 *
 * Never throws; every outcome comes back as a RefundResult.
 *
 * @param opts.resolvedBy Admin user id, when this refund is a dispute
 *   resolution. Recorded atomically with the status flip so the decision and
 *   its outcome can't disagree.
 */
export async function refundOrder(
  admin: SupabaseClient,
  orderId: string,
  reason: RefundReason,
  opts: { resolvedBy?: string } = {},
): Promise<RefundResult> {
  const skip = (r: RefundSkipReason): RefundResult => ({
    ok: true,
    outcome: "skipped",
    orderId,
    reason: r,
  });

  // ---- Preflight ---------------------------------------------------------
  const { data, error: loadErr } = await admin
    .from("orders")
    .select(ORDER_SELECT)
    .eq("id", orderId)
    .maybeSingle();

  // Distinguish "the query broke" from "no such row". Conflating them reports a
  // missing migration as a missing order, which is a genuinely misleading thing
  // for a money mover to say.
  if (loadErr) {
    console.error(
      `[refund] order ${orderId}: LOOKUP FAILED (not a missing order) — ${loadErr.message}`,
    );
    Sentry.captureException(loadErr);
    return skip("lookup_failed");
  }
  if (!data) {
    console.error(`[refund] order ${orderId} does not exist`);
    return skip("order_not_found");
  }
  const order = data as unknown as OrderRow;

  if (order.status === "refunded") return skip("already_refunded");

  // ---- HARD GUARD: money already went to the seller ----------------------
  // Not a skip — an actionable refusal. Automating a transfer reversal is out
  // of Phase 4 scope, so this surfaces the case loudly instead of pretending
  // it was handled.
  if (order.status === "released") {
    const payoutCents = order.item_price_cents - order.seller_fee_cents;
    const message =
      `Order ${orderId} was already released to the seller ` +
      `(transfer ${order.stripe_transfer_id ?? "unknown"}, ${payoutCents}c). ` +
      `Refund NOT attempted — reverse it manually in the Stripe dashboard.`;
    console.error(`[refund] MANUAL REVERSAL REQUIRED: ${message}`);
    return {
      ok: false,
      outcome: "manual_reversal_required",
      orderId,
      transferId: order.stripe_transfer_id,
      payoutCents,
      message,
    };
  }

  // A transfer is mid-flight. Refunding now could double-spend, so wait: the
  // order will settle to 'released' (manual case) or back to 'paid_held'.
  if (order.status === "releasing") return skip("release_in_flight");

  if (!REFUNDABLE_STATUSES.includes(order.status)) return skip("not_refundable");
  if (order.refund_attempts >= MAX_REFUND_ATTEMPTS) return skip("attempts_exhausted");
  if (!order.stripe_payment_intent_id) {
    console.error(`[refund] order ${orderId} has no PaymentIntent to refund`);
    return skip("no_payment_intent");
  }
  if (order.gross_captured_cents <= 0) return skip("not_refundable");

  // Sanity: what we captured should equal item + buyer fee. A mismatch means
  // the order is malformed — refund the CAPTURED amount (what the buyer
  // actually paid), but make the discrepancy visible.
  const expected = order.item_price_cents + order.buyer_fee_cents;
  if (expected !== order.gross_captured_cents) {
    console.warn(
      `[refund] order ${orderId}: captured ${order.gross_captured_cents}c != item+fee ${expected}c; refunding captured amount`,
    );
  }

  // ---- CAS claim ---------------------------------------------------------
  // Deliberately does NOT filter on disputed_at: frozen orders are exactly the
  // ones being refunded. The status set is what keeps this exclusive with
  // releaseOrder.
  const { data: claimed, error: claimErr } = await admin
    .from("orders")
    .update({
      status: "refunding",
      refund_attempts: order.refund_attempts + 1,
      refund_reason: reason,
    })
    .eq("id", orderId)
    .in("status", REFUNDABLE_STATUSES)
    .select("id, refund_attempts")
    .maybeSingle();

  // Same distinction as releaseOrder: a failed UPDATE is not a lost race.
  if (claimErr) {
    console.error(
      `[refund] order ${orderId}: CLAIM FAILED (not a lost race) — ${claimErr.message}`,
    );
    Sentry.captureException(claimErr);
    return skip("claim_failed");
  }
  if (!claimed) {
    // Genuinely lost the race — a release claimed it, or another refund runs.
    return skip("not_refundable");
  }
  const attempts = (claimed as { refund_attempts: number }).refund_attempts;

  /** Hand the order back for a later retry. Money did NOT move on this path. */
  const failAndRelease = async (message: string): Promise<RefundResult> => {
    const exhausted = attempts >= MAX_REFUND_ATTEMPTS;
    await admin
      .from("orders")
      .update({
        // Back to paid_held so the buyer's money stays held and retryable.
        // Only park it once attempts are spent.
        status: exhausted ? "refund_failed" : "paid_held",
        refund_error: message.slice(0, 500),
      })
      .eq("id", orderId)
      .eq("status", "refunding");

    console.error(
      `[refund] order ${orderId} attempt ${attempts} failed: ${message}` +
        (exhausted ? " (attempts exhausted — parked)" : ""),
    );

    if (exhausted) {
      // Money-critical: a buyer we told would be refunded is still out of
      // pocket, and auto-retry has stopped.
      await alertCritical({
        event: "refund_failed_exhausted",
        summary: `Order ${orderId} failed to refund after ${attempts} attempts — the buyer has NOT been refunded.`,
        details: {
          orderId,
          meetupId: order.meetup_id,
          buyerId: order.buyer_id,
          amountCents: order.gross_captured_cents,
          refundReason: reason,
          lastError: message,
          action:
            "Funds are still held on the platform. Investigate, then reset orders.status to 'paid_held' and refund_attempts to 0 to resume, or refund manually in Stripe.",
        },
      });
    }

    return { ok: false, outcome: "failed", orderId, error: message, attempts, exhausted };
  };

  const stripe = getStripe();
  const paymentIntentId = order.stripe_payment_intent_id;

  try {
    // ---- Recover an orphaned refund from a previous attempt --------------
    let refund: Stripe.Refund | null = null;
    let recovered = false;
    if (attempts > 1) {
      const existing = await findExistingRefund(stripe, paymentIntentId);
      if (existing === undefined) {
        return failAndRelease("refund lookup failed; not risking a duplicate");
      }
      if (existing) {
        refund = existing;
        recovered = true;
        console.warn(
          `[refund] order ${orderId}: adopted existing refund ${existing.id} from a prior attempt`,
        );
      }
    }

    // ---- Create the refund ----------------------------------------------
    if (!refund) {
      refund = await stripe.refunds.create(
        {
          payment_intent: paymentIntentId,
          // No `amount` — Stripe refunds the full remaining amount. Doing the
          // arithmetic ourselves would risk drifting from what was captured.
          reason: "requested_by_customer",
          metadata: {
            order_id: orderId,
            meetup_id: order.meetup_id ?? "",
            refund_reason: reason,
            freeze_reason: order.freeze_reason ?? "",
          },
        },
        { idempotencyKey: `refund_${orderId}` },
      );
    }

    // ---- Money has moved back. Record it before anything else can fail. ---
    const refundedAt = new Date().toISOString();
    const update: Record<string, unknown> = {
      status: "refunded",
      stripe_refund_id: refund.id,
      // Stripe is authoritative, but storing it makes reporting and support
      // queries possible without an API call.
      refund_amount_cents: refund.amount,
      refunded_at: refundedAt,
      refund_reason: reason,
      refund_error: null,
    };
    // Atomic with the status flip, so a dispute decision and its outcome can
    // never disagree.
    if (opts.resolvedBy) {
      update.dispute_resolution = "refund_buyer";
      update.dispute_resolved_at = refundedAt;
      update.dispute_resolved_by = opts.resolvedBy;
    }

    const { error: markErr } = await admin
      .from("orders")
      .update(update)
      .eq("id", orderId);

    if (markErr) {
      // Refund succeeded but we couldn't record it. Do NOT revert — that would
      // invite a second refund. Loud, and recoverable via the refunds lookup.
      await alertCritical({
        event: "refund_unrecorded",
        summary: `Stripe refund ${refund.id} SUCCEEDED but order ${orderId} could not be marked refunded. Money returned; the database does not know.`,
        details: {
          orderId,
          refundId: refund.id,
          amountCents: refund.amount,
          dbError: markErr.message,
          action: `Do NOT re-run refund. Set orders.status='refunded', stripe_refund_id='${refund.id}', refunded_at=now() for order ${orderId}.`,
        },
      });
    }

    await notifyRefunded(admin, order, refund.amount, reason);

    console.log(
      `[refund] order ${orderId} refunded ${refund.amount}c to buyer via ${refund.id} ` +
        `(${reason}${recovered ? ", recovered" : ""})`,
    );
    return {
      ok: true,
      outcome: "refunded",
      orderId,
      refundId: refund.id,
      amountCents: refund.amount,
      recovered,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown refund error";
    Sentry.captureException(err);
    return failAndRelease(message);
  }
}

/**
 * Refund every still-holding order attached to a meetup.
 *
 * Mirrors freezeOrdersForMeetup so the trigger routes stay thin: they decide
 * WHETHER a refund is warranted, this decides which orders that means.
 *
 * `released` orders are deliberately included in the query rather than filtered
 * out — refundOrder's hard guard turns them into an explicit
 * manual_reversal_required result, so a post-release case surfaces to the
 * caller instead of silently matching nothing.
 *
 * Never throws. Returns one result per order; an empty array means the meetup
 * had no order holding funds, which is normal for unpaid meetups.
 */
export async function refundOrdersForMeetup(
  admin: SupabaseClient,
  meetupId: string,
  reason: RefundReason,
): Promise<RefundResult[]> {
  const { data, error } = await admin
    .from("orders")
    .select("id")
    .eq("meetup_id", meetupId)
    .in("status", [...REFUNDABLE_STATUSES, "released"]);

  if (error) {
    console.error(
      `[refund] could not list orders for meetup ${meetupId} — no refund attempted:`,
      error,
    );
    Sentry.captureException(error);
    return [];
  }

  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  const results: RefundResult[] = [];
  for (const id of ids) {
    results.push(await refundOrder(admin, id, reason));
  }
  return results;
}

/**
 * Put the item back on the market, and tell both parties.
 *
 * There is no ledger row to unwind: a pre-release refund never had one
 * (transactions are written only by releaseOrder), and the meetup is already in
 * its terminal state. So the only projection is the listing.
 *
 * All three trigger routes already reactivate the listing themselves; doing it
 * here too makes refundOrder self-contained, so any future caller — including
 * admin dispute resolution — gets the right outcome without having to remember.
 *
 * Failures are swallowed: the refund has happened and must not be undone by a
 * bookkeeping problem.
 */
async function notifyRefunded(
  admin: SupabaseClient,
  order: OrderRow,
  amountCents: number,
  reason: RefundReason,
): Promise<void> {
  try {
    // Reactivate — but never resurrect a listing an admin removed. 'removed' is
    // a moderation decision and a refund must not override it.
    if (order.listing_id) {
      const { error: listingErr } = await admin
        .from("listings")
        .update({ status: "active" })
        .eq("id", order.listing_id)
        .in("status", ["sold", "pending"]);
      if (listingErr) {
        console.error(
          `[refund] order ${order.id}: listing ${order.listing_id} not reactivated`,
          listingErr,
        );
      }
    }

    const { data: listingRow } = await admin
      .from("listings")
      .select("title")
      .eq("id", order.listing_id ?? "")
      .maybeSingle();
    const title = (listingRow as { title: string } | null)?.title ?? "your order";
    const amount = `$${(amountCents / 100).toFixed(2)}`;

    const why: Record<RefundReason, string> = {
      cancelled: "the meetup was cancelled",
      seller_no_show: "the seller didn't show",
      buyer_no_show: "the meetup didn't happen",
      dispute_upheld: "we reviewed your report",
    };

    await Promise.all([
      createNotification({
        userId: order.buyer_id,
        type: "transaction_complete",
        title: "Refund issued 💸",
        body: `${amount} for ${title} is on its way back to you because ${why[reason]}. Refunds usually appear within 5–10 business days.`,
        link: "/profile/transactions",
      }),
      createNotification({
        userId: order.seller_id,
        type: "transaction_complete",
        title: "Order refunded",
        body: `The payment for ${title} was refunded to the buyer. No payout will be made for this order.`,
        link: "/profile/wallet",
      }),
    ]);
  } catch (err) {
    console.error(`[refund] notification failed for order ${order.id}`, err);
    Sentry.captureException(err);
  }
}
