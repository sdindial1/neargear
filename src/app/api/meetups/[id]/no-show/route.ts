import * as Sentry from "@sentry/nextjs";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { issueStrike } from "@/lib/strikes";
import { createNotification } from "@/lib/notifications/inapp";

interface Body {
  role: "buyer" | "seller";
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
    const role = body.role;
    if (role !== "buyer" && role !== "seller") {
      return Response.json({ error: "Invalid role" }, { status: 400 });
    }

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
        "id, status, buyer_id, seller_id, listing_id, no_show_reported_by, listing:listings!listing_id(title)",
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
      no_show_reported_by: string | null;
      listing: { title: string } | null;
    };

    // Authorization: caller must be the role they're claiming
    const callerIsBuyer = m.buyer_id === user.id;
    const callerIsSeller = m.seller_id === user.id;
    if (
      (role === "buyer" && !callerIsBuyer) ||
      (role === "seller" && !callerIsSeller)
    ) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    if (m.status !== "scheduled") {
      return Response.json(
        { error: `Meetup is ${m.status}, can't report no-show` },
        { status: 409 },
      );
    }
    if (m.no_show_reported_by) {
      return Response.json(
        { error: "Already reported" },
        { status: 409 },
      );
    }

    // role === "buyer" means *the buyer* is reporting → seller didn't show.
    // role === "seller" means *the seller* is reporting → buyer didn't show.
    const offendingUserId = role === "buyer" ? m.seller_id : m.buyer_id;
    const newStatus = role === "buyer" ? "no_show_seller" : "no_show_buyer";
    const strikeType = role === "buyer" ? "seller_no_show" : "buyer_no_show";
    const issuedBy = role; // "buyer" or "seller"
    const nowIso = new Date().toISOString();

    await admin
      .from("meetups")
      .update({
        status: newStatus,
        no_show_reported_by: role,
        no_show_reported_at: nowIso,
      })
      .eq("id", meetupId);

    // Free up the listing again
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
      issuedBy,
    });

    // Notify the offending party (the strike notification already fires
    // inside issueStrike — this one is the meetup-context message)
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

    return Response.json({
      ok: true,
      status: newStatus,
    });
  } catch (err) {
    console.error("[no-show] error", err);
    Sentry.captureException(err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
