import * as Sentry from "@sentry/nextjs";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createNotification } from "@/lib/notifications/inapp";
import { notifyWishlistReactivation } from "@/lib/notifications";
import { freezeOrdersForMeetup, type FreezeReason } from "@/lib/orders/freeze";
import { sanitizeText } from "@/lib/sanitize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Free-cancellation window for BUYERS, in hours before the meetup window
 * starts. Inside it, a buyer cancel does not auto-refund — it freezes and goes
 * to admin review. Sellers have no such cutoff: a seller cancelling at any time
 * refunds the buyer.
 */
const LATE_CANCEL_HOURS = 24;

/**
 * POST /api/meetups/[id]/cancel
 *
 * Moved server-side in payments Phase 3 Step 6. The cancel page previously
 * wrote meetups.status straight from the browser, which meant a cancellation
 * could not freeze the order: the browser holds the anon key and `orders` has
 * no RLS UPDATE policy (correctly). So a meetup cancelled after payment left a
 * live auto-release timer pointed at the seller.
 *
 * Same shape of problem the Step 4 rewire fixed for completion: a money-
 * relevant state transition being written by the client.
 *
 * This does NOT refund anything. It stops money leaving; Phase 4 decides where
 * held funds go on a cancellation.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: meetupId } = await params;

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      reason?: string;
    };
    const reason = sanitizeText(body.reason ?? "", 200);

    const admin = createAdminSupabaseClient();
    if (!admin) {
      return Response.json(
        { error: "Service role not configured" },
        { status: 500 },
      );
    }

    const { data: meetup, error: loadErr } = await admin
      .from("meetups")
      .select(
        "id, status, buyer_id, seller_id, listing_id, meetup_window_start, " +
          "listing:listings!listing_id(title)",
      )
      .eq("id", meetupId)
      .single();

    if (loadErr || !meetup) {
      return Response.json({ error: "Meetup not found" }, { status: 404 });
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

    const isBuyer = m.buyer_id === user.id;
    const isSeller = m.seller_id === user.id;
    if (!isBuyer && !isSeller) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    if (m.status.startsWith("cancelled")) {
      return Response.json({
        ok: true,
        outcome: "already_cancelled",
        status: m.status,
      });
    }
    if (["completed", "payment_processing"].includes(m.status)) {
      return Response.json(
        {
          error: "not_cancellable",
          message: "This meetup is already complete and can't be cancelled.",
        },
        { status: 409 },
      );
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
      return Response.json({ error: "update_failed" }, { status: 500 });
    }

    // ---- Refund eligibility, decided SERVER-SIDE -------------------------
    // The cancel page computes a lateness warning for the UI, but the money
    // decision must never come from the client.
    //
    //   seller cancels, any time      -> auto-refund (the buyer did nothing wrong)
    //   buyer cancels  >24h out       -> auto-refund (free cancellation window)
    //   buyer cancels  <24h out       -> FREEZE + admin review, resolved binary
    //
    // A late buyer cancel is mechanically a dispute: same freeze, same queue,
    // same refund-or-release decision. There is no separate late-cancel path.
    const windowStartMs = m.meetup_window_start
      ? Date.parse(m.meetup_window_start)
      : null;
    const hoursUntilWindow =
      windowStartMs === null ? null : (windowStartMs - Date.now()) / 3_600_000;

    // Missing window => treat as late. Fail toward review, never toward
    // automatically moving money on incomplete data.
    const isLateBuyerCancel =
      role === "buyer" && (hoursUntilWindow === null || hoursUntilWindow < LATE_CANCEL_HOURS);

    const freezeReason: FreezeReason = isLateBuyerCancel
      ? "cancelled_late"
      : "cancelled";

    // Freeze regardless of which branch: the auto-refund cases are refunded
    // from this frozen state in Step 3, so nothing can auto-release in between.
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

    // The counterparty was previously only console.logged. Now that this runs
    // server-side, they actually get told.
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

    // Only say "refunded" where a refund will actually happen. Step 3 wires the
    // auto-refund itself; until then the eligible cases stay frozen rather than
    // claiming a refund that hasn't been built.
    const heldFunds = freeze.frozen > 0;

    return Response.json({
      ok: true,
      outcome: "cancelled",
      status: newStatus,
      ordersFrozen: freeze.frozen,
      // Surfaced so the UI can be honest if money already went out.
      alreadyReleased: freeze.alreadyReleased,
      freezeReason,
      requiresReview: isLateBuyerCancel && heldFunds,
      hoursUntilWindow:
        hoursUntilWindow === null ? null : Math.round(hoursUntilWindow * 10) / 10,
      message: !heldFunds
        ? "Meetup cancelled."
        : isLateBuyerCancel
          ? `Meetup cancelled. Because this was within ${LATE_CANCEL_HOURS} hours of the meetup, your payment is held while our team reviews it.`
          : "Meetup cancelled. Your payment will be refunded in full.",
    });
  } catch (err) {
    console.error("[cancel] error", err);
    Sentry.captureException(err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
