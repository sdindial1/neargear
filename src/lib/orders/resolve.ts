import type { SupabaseClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { refundOrder } from "@/lib/orders/refund";
import { releaseOrder } from "@/lib/orders/release";
import { createNotification } from "@/lib/notifications/inapp";
import type { DisputeResolution } from "@/types/database";

/**
 * Admin resolution of a frozen order — payments Phase 4 Step 4.
 *
 * Everything that routes to admin review lands here: item disputes, buyer
 * cancels inside 24h, and buyer no-shows. The decision is BINARY by design:
 * the whole amount goes back to the buyer, or the whole payout goes to the
 * seller. Partial splits are deliberately not modelled — they multiply the
 * number of money states and every one of them needs its own recovery story.
 *
 * This adds no new money mechanics. Both branches call the movers that have
 * already been proven: refundOrder() and releaseOrder(). This function only
 * decides which one runs and records who decided.
 */

export type ResolveOutcome =
  | {
      ok: true;
      resolution: DisputeResolution;
      orderId: string;
      /** re_… or tr_… depending on the branch. */
      stripeId: string | null;
      amountCents: number | null;
      message: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
      message: string;
      /** Set when the refusal was because funds already left. */
      transferId?: string | null;
    };

interface FrozenOrder {
  id: string;
  status: string;
  disputed_at: string | null;
  freeze_reason: string | null;
  buyer_id: string | null;
  seller_id: string | null;
  listing_id: string | null;
  item_price_cents: number;
  seller_fee_cents: number;
  gross_captured_cents: number;
}

export async function resolveDispute(
  admin: SupabaseClient,
  input: {
    orderId: string;
    resolution: DisputeResolution;
    adminUserId: string;
  },
): Promise<ResolveOutcome> {
  const { orderId, resolution, adminUserId } = input;

  const { data, error: loadErr } = await admin
    .from("orders")
    .select(
      "id, status, disputed_at, freeze_reason, buyer_id, seller_id, listing_id, " +
        "item_price_cents, seller_fee_cents, gross_captured_cents",
    )
    .eq("id", orderId)
    .maybeSingle();

  // A broken query is not a missing order — same distinction as the movers.
  if (loadErr) {
    console.error(`[resolve] order ${orderId}: LOOKUP FAILED — ${loadErr.message}`);
    Sentry.captureException(loadErr);
    return {
      ok: false,
      status: 500,
      error: "lookup_failed",
      message: loadErr.message,
    };
  }
  if (!data) {
    return { ok: false, status: 404, error: "order_not_found", message: "Order not found." };
  }
  const order = data as unknown as FrozenOrder;

  // Only frozen, still-holding orders are resolvable. Anything else has already
  // been decided, and re-deciding it would move money twice.
  if (!order.disputed_at) {
    return {
      ok: false,
      status: 409,
      error: "not_frozen",
      message: "This order isn't in the review queue.",
    };
  }
  if (order.status === "refunded") {
    return {
      ok: false,
      status: 409,
      error: "already_refunded",
      message: "This order has already been refunded.",
    };
  }
  if (order.status === "released") {
    return {
      ok: false,
      status: 409,
      error: "already_released",
      message:
        "Funds already went to the seller. Reverse the transfer in the Stripe dashboard — this cannot be undone from here.",
    };
  }
  if (!["paid_held", "release_failed"].includes(order.status)) {
    return {
      ok: false,
      status: 409,
      error: "not_resolvable",
      message: `Order is ${order.status} and can't be resolved.`,
    };
  }

  // ---- Refund the buyer --------------------------------------------------
  if (resolution === "refund_buyer") {
    // refundOrder's CAS deliberately ignores disputed_at, so the freeze can
    // stay in place through the refund. It also stamps the resolution columns
    // atomically with the status flip via resolvedBy.
    const result = await refundOrder(admin, orderId, "dispute_upheld", {
      resolvedBy: adminUserId,
    });

    if (result.outcome === "refunded") {
      await notifyResolution(admin, order, "refund_buyer", result.amountCents);
      return {
        ok: true,
        resolution,
        orderId,
        stripeId: result.refundId,
        amountCents: result.amountCents,
        message: `Refunded $${(result.amountCents / 100).toFixed(2)} to the buyer.`,
      };
    }
    if (result.outcome === "manual_reversal_required") {
      return {
        ok: false,
        status: 409,
        error: "already_released",
        message: result.message,
        transferId: result.transferId,
      };
    }
    return {
      ok: false,
      status: 500,
      error: result.outcome === "failed" ? "refund_failed" : "refund_skipped",
      message:
        result.outcome === "failed"
          ? `Refund failed: ${result.error}. The money is still held and will retry.`
          : `Refund did not run (${result.reason}).`,
    };
  }

  // ---- Release to the seller ---------------------------------------------
  // releaseOrder's CAS refuses disputed orders by design, so the freeze must be
  // lifted first. Record the decision in the SAME update, so an order can never
  // be unfrozen without a recorded reason for it.
  //
  // If the transfer then fails, the order returns to paid_held with the freeze
  // already lifted — which is correct: the admin decided it should go to the
  // seller, so letting the sweep retry is the intended behaviour, not a leak.
  const nowIso = new Date().toISOString();
  const { data: unfrozen, error: unfreezeErr } = await admin
    .from("orders")
    .update({
      disputed_at: null,
      dispute_resolution: "release_seller",
      dispute_resolved_at: nowIso,
      dispute_resolved_by: adminUserId,
    })
    .eq("id", orderId)
    .not("disputed_at", "is", null)
    .select("id")
    .maybeSingle();

  if (unfreezeErr || !unfrozen) {
    return {
      ok: false,
      status: 409,
      error: "unfreeze_failed",
      message: "Couldn't lift the hold — someone may have resolved this already.",
    };
  }

  const result = await releaseOrder(admin, orderId, "admin_release");

  if (result.outcome === "released") {
    await notifyResolution(admin, order, "release_seller", result.payoutCents);
    return {
      ok: true,
      resolution,
      orderId,
      stripeId: result.transferId,
      amountCents: result.payoutCents,
      message: `Released $${(result.payoutCents / 100).toFixed(2)} to the seller.`,
    };
  }

  return {
    ok: false,
    status: 500,
    error: result.outcome === "failed" ? "release_failed" : "release_skipped",
    message:
      result.outcome === "failed"
        ? `Transfer failed: ${result.error}. The hold is lifted and the payout will retry automatically.`
        : `Release did not run (${result.outcome === "skipped" ? result.reason : "unknown"}).`,
  };
}

/** Tell both parties how it went. Never throws. */
async function notifyResolution(
  admin: SupabaseClient,
  order: FrozenOrder,
  resolution: DisputeResolution,
  amountCents: number | null,
): Promise<void> {
  try {
    const { data: listingRow } = await admin
      .from("listings")
      .select("title")
      .eq("id", order.listing_id ?? "")
      .maybeSingle();
    const title = (listingRow as { title: string } | null)?.title ?? "your order";
    const amount = amountCents ? `$${(amountCents / 100).toFixed(2)}` : "";

    if (resolution === "refund_buyer") {
      // refundOrder already notified both parties about the refund itself;
      // this adds the "we reviewed it" framing that a queued case needs.
      await createNotification({
        userId: order.buyer_id,
        type: "item_dispute_filed",
        title: "Your case was resolved",
        body: `We reviewed ${title} and refunded ${amount} to you.`,
        link: "/profile/transactions",
      });
      return;
    }

    await Promise.all([
      createNotification({
        userId: order.seller_id,
        type: "transaction_complete",
        title: "Case resolved in your favour",
        body: `We reviewed ${title} and released ${amount} to you.`,
        link: "/profile/wallet",
      }),
      createNotification({
        userId: order.buyer_id,
        type: "item_dispute_filed",
        title: "Your case was resolved",
        body: `We reviewed ${title} and released the payment to the seller. Reply to your notification email if you'd like to discuss it.`,
        link: "/profile/transactions",
      }),
    ]);
  } catch (err) {
    console.error(`[resolve] notification failed for order ${order.id}`, err);
    Sentry.captureException(err);
  }
}
