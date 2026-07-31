import * as Sentry from "@sentry/nextjs";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createNotification } from "@/lib/notifications/inapp";
import { notifyWishlistReactivation } from "@/lib/notifications";
import { freezeOrdersForMeetup } from "@/lib/orders/freeze";
import { sanitizeText } from "@/lib/sanitize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
        "id, status, buyer_id, seller_id, listing_id, listing:listings!listing_id(title)",
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

    // Rung 4 — stop any auto-release before anything else can run.
    const freeze = await freezeOrdersForMeetup(admin, meetupId, "cancelled");

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

    return Response.json({
      ok: true,
      outcome: "cancelled",
      status: newStatus,
      ordersFrozen: freeze.frozen,
      // Surfaced so the UI can be honest if money already went out.
      alreadyReleased: freeze.alreadyReleased,
    });
  } catch (err) {
    console.error("[cancel] error", err);
    Sentry.captureException(err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
