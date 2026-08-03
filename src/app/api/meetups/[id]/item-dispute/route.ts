import * as Sentry from "@sentry/nextjs";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createNotification } from "@/lib/notifications/inapp";
import { freezeOrdersForMeetup } from "@/lib/orders/freeze";
import { sanitizeText } from "@/lib/sanitize";

const VALID_REASONS = new Set([
  "Item condition is much worse than listed",
  "This is the wrong item",
  "Item is damaged",
  "Item appears fake or counterfeit",
  "Other",
]);

interface Body {
  reason?: string;
  notes?: string;
}

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

    const body = (await request.json().catch(() => ({}))) as Body;
    const reason = body.reason ?? "";
    if (!VALID_REASONS.has(reason)) {
      return Response.json({ error: "Invalid reason" }, { status: 400 });
    }
    const notes = sanitizeText(body.notes ?? "", 200);

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

    // Buyer-only flow
    if (m.buyer_id !== user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    if (m.status !== "scheduled") {
      return Response.json(
        { error: `Meetup is ${m.status}, can't open dispute` },
        { status: 409 },
      );
    }

    const nowIso = new Date().toISOString();

    // FREEZE FIRST. The buyer's 24h window may already be counting down toward
    // an automatic payout, so stopping the money is more urgent than recording
    // why. If the record write below fails, the funds are still safe.
    await freezeOrdersForMeetup(admin, meetupId, "item_dispute");

    // Then persist the dispute itself. This update was previously unchecked,
    // and it has been failing silently: it writes columns that migration 008
    // creates, and 008 was never applied. The result was a dispute that froze
    // the money correctly but left no record — the meetup stayed 'scheduled',
    // the reason was lost, and the admin queue never saw it.
    //
    // Now it reports. A dispute nobody can review is not a filed dispute.
    const { error: recordErr } = await admin
      .from("meetups")
      .update({
        status: "item_dispute",
        item_dispute_reason: reason,
        item_dispute_notes: notes || null,
        item_dispute_reported_at: nowIso,
      })
      .eq("id", meetupId);

    if (recordErr) {
      console.error(
        `[item-dispute] meetup ${meetupId}: funds are frozen but the dispute could NOT be recorded`,
        recordErr,
      );
      Sentry.captureException(recordErr);
      return Response.json(
        {
          error: "dispute_not_recorded",
          message:
            "Your payment has been held, but we couldn't file the report. Please contact support so we can review it.",
        },
        { status: 500 },
      );
    }

    if (m.listing_id) {
      await admin
        .from("listings")
        .update({ status: "active" })
        .eq("id", m.listing_id);
    }

    const title = m.listing?.title ?? "your item";

    await createNotification({
      userId: m.seller_id,
      type: "item_dispute_reported",
      title: "Buyer reported an item issue",
      body: `A buyer reported an issue with ${title}. Our team will review.`,
      link: `/meetups/${meetupId}`,
    });
    await createNotification({
      userId: m.buyer_id,
      type: "item_dispute_filed",
      title: "Item issue reported",
      body: `Your dispute for ${title} has been filed. Your payment will be refunded.`,
      link: "/profile/meetups",
    });

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[item-dispute] error", err);
    Sentry.captureException(err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
