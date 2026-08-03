import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotification } from "@/lib/notifications/inapp";
import { notifyWishlistReactivation } from "@/lib/notifications";
import { freezeOrdersForMeetup, type FreezeReason } from "@/lib/orders/freeze";
import { refundOrdersForMeetup } from "@/lib/orders/refund";

/**
 * Cancellation outcome logic, extracted from the route so it has exactly one
 * implementation.
 *
 * The route is a thin auth wrapper around this; the dev trigger calls it with a
 * chosen actor. That matters: a test harness that reimplemented the 24-hour
 * branch would be testing the harness, not the product.
 *
 * Mirrors how releaseOrder/refundOrder are libs called by thin routes.
 */

/**
 * Free-cancellation window for BUYERS, in hours before the meetup window
 * starts. Inside it, a buyer cancel does not auto-refund — it freezes and goes
 * to admin review. Sellers have no such cutoff: a seller cancelling at any time
 * refunds the buyer, who did nothing wrong.
 */
export const LATE_CANCEL_HOURS = 24;

export type CancelOutcome =
  | { ok: true; outcome: "already_cancelled"; status: string }
  | {
      ok: true;
      outcome: "cancelled";
      status: string;
      role: "buyer" | "seller";
      freezeReason: FreezeReason;
      ordersFrozen: number;
      refunded: number;
      refundPending: number;
      manualReversal: boolean;
      requiresReview: boolean;
      hoursUntilWindow: number | null;
      message: string;
    }
  | { ok: false; status: number; error: string; message?: string };

export async function cancelMeetup(
  admin: SupabaseClient,
  input: { meetupId: string; actorId: string; reason?: string },
): Promise<CancelOutcome> {
  const { meetupId, actorId, reason = "" } = input;

  const { data: meetup, error: loadErr } = await admin
    .from("meetups")
    .select(
      "id, status, buyer_id, seller_id, listing_id, meetup_window_start, " +
        "listing:listings!listing_id(title)",
    )
    .eq("id", meetupId)
    .single();

  if (loadErr || !meetup) {
    return { ok: false, status: 404, error: "meetup_not_found" };
  }
  const m = meetup as unknown as {
    id: string;
    status: string;
    buyer_id: string;
    seller_id: string;
    listing_id: string | null;
    meetup_window_start: string | null;
    listing: { title: string } | null;
  };

  const isBuyer = m.buyer_id === actorId;
  const isSeller = m.seller_id === actorId;
  if (!isBuyer && !isSeller) {
    return { ok: false, status: 403, error: "forbidden" };
  }

  if (m.status.startsWith("cancelled")) {
    return { ok: true, outcome: "already_cancelled", status: m.status };
  }
  if (["completed", "payment_processing"].includes(m.status)) {
    return {
      ok: false,
      status: 409,
      error: "not_cancellable",
      message: "This meetup is already complete and can't be cancelled.",
    };
  }

  const role: "buyer" | "seller" = isSeller ? "seller" : "buyer";
  const newStatus = role === "seller" ? "cancelled_seller" : "cancelled_buyer";

  const { error: updErr } = await admin
    .from("meetups")
    .update({ status: newStatus })
    .eq("id", meetupId)
    .not("status", "like", "cancelled%");

  if (updErr) {
    console.error(`[cancel] meetup ${meetupId} update failed`, updErr);
    return { ok: false, status: 500, error: "update_failed" };
  }

  // ---- Refund eligibility, decided SERVER-SIDE ---------------------------
  //   seller cancels, any time -> auto-refund
  //   buyer cancels  >24h out  -> auto-refund
  //   buyer cancels  <24h out  -> FREEZE + admin review, resolved binary
  //
  // A late buyer cancel is mechanically a dispute: same freeze, same queue,
  // same refund-or-release decision. No separate late-cancel path.
  const windowStartMs = m.meetup_window_start
    ? Date.parse(m.meetup_window_start)
    : null;
  const hoursUntilWindow =
    windowStartMs === null ? null : (windowStartMs - Date.now()) / 3_600_000;

  // Missing window => treat as late. Fail toward review, never toward
  // automatically moving money on incomplete data.
  const isLateBuyerCancel =
    role === "buyer" &&
    (hoursUntilWindow === null || hoursUntilWindow < LATE_CANCEL_HOURS);

  const freezeReason: FreezeReason = isLateBuyerCancel
    ? "cancelled_late"
    : "cancelled";

  // Freeze regardless of branch: the auto-refund cases are refunded FROM this
  // frozen state, so nothing can auto-release in between.
  const freeze = await freezeOrdersForMeetup(admin, meetupId, freezeReason);

  if (m.listing_id) {
    await admin
      .from("listings")
      .update({ status: "active" })
      .eq("id", m.listing_id);

    if (m.listing?.title) {
      await notifyWishlistReactivation(admin, m.listing_id, m.listing.title);
    }
  }

  const otherUserId = isBuyer ? m.seller_id : m.buyer_id;
  await createNotification({
    userId: otherUserId,
    type: "meetup_declined",
    title: "Meetup cancelled",
    body: `The ${role} cancelled the meetup for ${m.listing?.title ?? "an item"}${
      reason ? `: ${reason}` : "."
    }`,
    link: "/profile/meetups",
  });

  // ---- Auto-refund -------------------------------------------------------
  // Refund AFTER the freeze: if the refund fails, the order is still frozen
  // and retryable rather than exposed to the release timer.
  let refunded = 0;
  let refundPending = 0;
  let manualReversal = false;

  if (!isLateBuyerCancel) {
    const results = await refundOrdersForMeetup(admin, meetupId, "cancelled");
    for (const r of results) {
      if (r.outcome === "refunded") refunded++;
      else if (r.outcome === "manual_reversal_required") manualReversal = true;
      else if (r.outcome === "failed") refundPending++;
    }
  }

  const heldFunds = freeze.frozen > 0;

  return {
    ok: true,
    outcome: "cancelled",
    status: newStatus,
    role,
    freezeReason,
    ordersFrozen: freeze.frozen,
    refunded,
    refundPending,
    manualReversal,
    requiresReview: isLateBuyerCancel && heldFunds,
    hoursUntilWindow:
      hoursUntilWindow === null ? null : Math.round(hoursUntilWindow * 10) / 10,
    // Report what actually happened, never what was intended.
    message: !heldFunds
      ? "Meetup cancelled."
      : isLateBuyerCancel
        ? `Meetup cancelled. Because this was within ${LATE_CANCEL_HOURS} hours of the meetup, your payment is held while our team reviews it.`
        : manualReversal
          ? "Meetup cancelled. This order had already been paid out — our team will sort the refund manually."
          : refunded > 0
            ? "Meetup cancelled. The full payment has been refunded to the buyer."
            : refundPending > 0
              ? "Meetup cancelled. The refund is processing and will complete shortly."
              : "Meetup cancelled.",
  };
}
