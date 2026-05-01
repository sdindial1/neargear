import * as Sentry from "@sentry/nextjs";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createNotification } from "@/lib/notifications/inapp";
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

    await admin
      .from("meetups")
      .update({
        status: "item_dispute",
        item_dispute_reason: reason,
        item_dispute_notes: notes || null,
        item_dispute_reported_at: nowIso,
      })
      .eq("id", meetupId);

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
      body: `Your dispute for ${title} has been filed. Your deposit will be refunded.`,
      link: "/profile/meetups",
    });

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[item-dispute] error", err);
    Sentry.captureException(err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
