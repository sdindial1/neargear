import * as Sentry from "@sentry/nextjs";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createNotification } from "@/lib/notifications/inapp";
import { sendHandoffConfirmedEmail } from "@/lib/notifications/email";
import { loadConfirmableOrder } from "@/lib/orders/confirm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/orders/[id]/confirm-handoff — RUNG 2 of the release ladder.
 *
 * The seller says they handed the item over. This does NOT release funds. It
 * starts the buyer's 24h window: we notify the buyer that the seller marked it
 * complete and invite them to confirm receipt or report a problem. If the buyer
 * does nothing, the cron sweep (Step 5) releases once the window has elapsed.
 *
 * The notification is sent HERE, synchronously, and buyer_notified_at is
 * stamped at the same moment. That's a deliberate accommodation of the daily
 * cron: if the sweep had to send the notice, rung 2 would need two sweeps and
 * stretch from 24-48h to 48-72h. Sending it at confirm time keeps the whole
 * rung inside one daily pass.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: orderId } = await params;

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminSupabaseClient();
    if (!admin) {
      return Response.json(
        { error: "Service role not configured" },
        { status: 500 },
      );
    }

    const guard = await loadConfirmableOrder(admin, orderId, user.id, "seller");
    if (!guard.ok) {
      return Response.json(
        { error: guard.error, message: guard.message },
        { status: guard.status },
      );
    }
    const order = guard.order;

    // Conditional claim: only the FIRST confirmation stamps and notifies. A
    // repeat tap returns no row, so we never re-notify or restart the clock.
    const nowIso = new Date().toISOString();
    const { data: claimed } = await admin
      .from("orders")
      .update({ seller_confirmed_at: nowIso, buyer_notified_at: nowIso })
      .eq("id", orderId)
      .is("seller_confirmed_at", null)
      .select("id")
      .maybeSingle();

    if (!claimed) {
      return Response.json({
        ok: true,
        outcome: "already_confirmed",
        message:
          "You've already marked this handed off. We're waiting on the buyer.",
      });
    }

    // The 24h clock is now running (stamped above). Tell the buyer — in-app AND
    // by email. The email is not redundant: the notification bell doesn't alert
    // in real time (POST-LAUNCH item 7), and this is the one notice where money
    // auto-releases on a timer tied to the buyer's inaction. An unseen notice
    // here means a chargeback instead of a dispute.
    const [{ data: listingRow }, { data: buyerRow }, { data: sellerRow }] =
      await Promise.all([
        admin
          .from("listings")
          .select("title")
          .eq("id", order.listing_id ?? "")
          .maybeSingle(),
        admin
          .from("users")
          .select("email, full_name")
          .eq("id", order.buyer_id ?? "")
          .maybeSingle(),
        admin
          .from("users")
          .select("email, full_name")
          .eq("id", order.seller_id ?? "")
          .maybeSingle(),
      ]);

    const listingTitle =
      (listingRow as { title: string } | null)?.title ?? "your item";
    const buyer = buyerRow as { email: string; full_name: string | null } | null;
    const seller = sellerRow as {
      email: string;
      full_name: string | null;
    } | null;

    await Promise.all([
      createNotification({
        userId: order.buyer_id,
        type: "handoff_confirmed",
        title: "Seller marked the handoff complete",
        body: `${listingTitle}: confirm you received it, or report a problem, within 24 hours. After that the payment is released to the seller automatically.`,
        link: order.meetup_id
          ? `/meetups/${order.meetup_id}`
          : "/profile/meetups",
      }),
      buyer?.email && order.meetup_id
        ? sendHandoffConfirmedEmail({
            buyer: { email: buyer.email, fullName: buyer.full_name },
            seller: {
              email: seller?.email ?? "",
              fullName: seller?.full_name ?? null,
            },
            meetupId: order.meetup_id,
            listingTitle,
            itemPriceCents: order.item_price_cents,
          })
        : Promise.resolve(),
    ]);

    return Response.json({
      ok: true,
      outcome: "awaiting_buyer",
      message:
        "Thanks! We've let the buyer know. If they don't respond within 24 hours, your payment is released automatically.",
    });
  } catch (err) {
    console.error("[confirm-handoff] error", err);
    Sentry.captureException(err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
