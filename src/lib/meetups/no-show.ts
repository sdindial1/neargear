import type { SupabaseClient } from "@supabase/supabase-js";
import { issueStrike } from "@/lib/strikes";
import { createNotification } from "@/lib/notifications/inapp";
import { freezeOrdersForMeetup } from "@/lib/orders/freeze";
import { refundOrdersForMeetup } from "@/lib/orders/refund";

/**
 * No-show outcome logic, extracted from the route so it has exactly one
 * implementation the dev trigger can exercise rather than reimplement.
 *
 * NOTE ON `role`: it is who is REPORTING, not who failed to show.
 *   role "buyer"  -> the buyer reports  -> the SELLER no-showed
 *   role "seller" -> the seller reports -> the BUYER no-showed
 */

export type NoShowOutcome =
  | {
      ok: true;
      status: string;
      role: "buyer" | "seller";
      ordersFrozen: number;
      refunded: number;
      manualReversal: boolean;
      requiresReview: boolean;
      message: string;
    }
  | { ok: false; status: number; error: string; message?: string };

export async function reportNoShow(
  admin: SupabaseClient,
  input: { meetupId: string; actorId: string; role: "buyer" | "seller" },
): Promise<NoShowOutcome> {
  const { meetupId, actorId, role } = input;

  const { data: meetup, error: loadErr } = await admin
    .from("meetups")
    .select(
      "id, status, buyer_id, seller_id, listing_id, no_show_reported_by, " +
        "listing:listings!listing_id(title)",
    )
    .eq("id", meetupId)
    .single();

  if (loadErr || !meetup) {
    // Distinguish a broken query from a missing meetup — this select touches
    // migration-008 columns, and reporting that as "not found" is what hid the
    // unapplied migration for an entire phase.
    if (loadErr) {
      console.error(
        `[no-show] meetup ${meetupId}: LOOKUP FAILED (not a missing meetup) — ${loadErr.message}`,
      );
      return {
        ok: false,
        status: 500,
        error: "lookup_failed",
        message: loadErr.message,
      };
    }
    return { ok: false, status: 404, error: "meetup_not_found" };
  }

  const m = meetup as unknown as {
    id: string;
    status: string;
    buyer_id: string;
    seller_id: string;
    listing_id: string | null;
    no_show_reported_by: string | null;
    listing: { title: string } | null;
  };

  // The caller must actually be the role they claim.
  const callerIsBuyer = m.buyer_id === actorId;
  const callerIsSeller = m.seller_id === actorId;
  if (
    (role === "buyer" && !callerIsBuyer) ||
    (role === "seller" && !callerIsSeller)
  ) {
    return { ok: false, status: 403, error: "forbidden" };
  }

  if (m.status !== "scheduled") {
    return {
      ok: false,
      status: 409,
      error: "not_reportable",
      message: `Meetup is ${m.status}, can't report a no-show.`,
    };
  }
  if (m.no_show_reported_by) {
    return { ok: false, status: 409, error: "already_reported" };
  }

  const offendingUserId = role === "buyer" ? m.seller_id : m.buyer_id;
  const newStatus = role === "buyer" ? "no_show_seller" : "no_show_buyer";
  const strikeType = role === "buyer" ? "seller_no_show" : "buyer_no_show";
  const nowIso = new Date().toISOString();

  const { error: updErr } = await admin
    .from("meetups")
    .update({
      status: newStatus,
      no_show_reported_by: role,
      no_show_reported_at: nowIso,
    })
    .eq("id", meetupId);

  if (updErr) {
    console.error(`[no-show] meetup ${meetupId} update failed`, updErr);
    return { ok: false, status: 500, error: "update_failed", message: updErr.message };
  }

  // Freeze first: without it the 7d backstop would pay the seller a week after
  // the buyer reported them as a no-show.
  const freeze = await freezeOrdersForMeetup(admin, meetupId, "no_show");

  // ---- Auto-refund -------------------------------------------------------
  // The Phase 4 trigger model, in full:
  //
  //   AUTO-REFUND  buyer cancels >24h out  |  seller no-show
  //   ADMIN REVIEW buyer cancels <24h      |  item dispute  |  buyer no-show
  //
  // SELLER no-show refunds: the buyer turned up and got nothing, so there is no
  // basis to hold their money.
  //
  // BUYER no-show freezes for review. The seller showed up and still has the
  // item, so who the money belongs to is a judgement call — refund the buyer,
  // or compensate the seller. Nothing is stranded: it sits in the admin queue
  // alongside disputes and late cancels until a human decides.
  let refunded = 0;
  let manualReversal = false;

  if (role === "buyer") {
    const results = await refundOrdersForMeetup(admin, meetupId, "seller_no_show");
    for (const r of results) {
      if (r.outcome === "refunded") refunded++;
      else if (r.outcome === "manual_reversal_required") manualReversal = true;
    }
  }

  if (m.listing_id) {
    await admin
      .from("listings")
      .update({ status: "active" })
      .eq("id", m.listing_id);
  }

  await issueStrike(admin, {
    userId: offendingUserId,
    meetupId,
    type: strikeType,
    issuedBy: role,
  });

  await createNotification({
    userId: offendingUserId,
    type: "strike_issued",
    title:
      role === "buyer"
        ? "Buyer reported you as a no-show"
        : "Seller reported you as a no-show",
    body: `Your meetup for ${m.listing?.title ?? "the item"} was marked as a no-show.`,
    link: `/meetups/${meetupId}`,
  });

  return {
    ok: true,
    status: newStatus,
    role,
    ordersFrozen: freeze.frozen,
    refunded,
    manualReversal,
    requiresReview: role === "seller" && freeze.frozen > 0,
    message:
      role === "buyer"
        ? manualReversal
          ? "Reported. This order had already been paid out — our team will sort the refund manually."
          : refunded > 0
            ? "Reported. Your payment has been refunded in full."
            : "Reported. Thanks for letting us know."
        : freeze.frozen > 0
          ? "Reported. The buyer's payment is held while our team reviews it."
          : "Reported. Thanks for letting us know.",
  };
}
