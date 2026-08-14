import * as Sentry from "@sentry/nextjs";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import {
  sendMeetupScheduledEmails,
  sendNewRequestEmail,
  sendRequestDeclinedEmail,
  sendTransactionCompleteEmails,
  type EmailListing,
} from "@/lib/notifications/email";
import {
  sendMeetupAcceptedSMS,
  sendNewRequestSMS,
} from "@/lib/notifications/sms";
import { createNotification } from "@/lib/notifications/inapp";
import {
  formatDateLine,
  formatDateOnly,
  parseLocation,
} from "@/lib/notifications/meetup-context";

type Event =
  | "meetup_requested"
  | "meetup_accepted"
  | "meetup_declined"
  | "transaction_complete";

interface Payload {
  event: Event;
  meetupId?: string;
  transactionId?: string;
}

interface Party {
  id: string;
  email: string;
  full_name: string | null;
}

interface PartyWithPhone extends Party {
  phone: string | null;
  /** Drives the payout warning carried inside the seller's emails. */
  stripe_payouts_enabled: boolean | null;
}

interface Listing {
  id: string;
  title: string;
  retail_price: number | null;
  photo_urls: string[] | null;
  condition: string | null;
}

interface MeetupRow {
  id: string;
  status: string;
  offered_price: number | null;
  meetup_window_start: string | null;
  meetup_window_end: string | null;
  meetup_location: string | null;
  buyer: PartyWithPhone | null;
  seller: PartyWithPhone | null;
  listing: Listing | null;
}

/**
 * Listing row -> product card input. photo_urls defaults to '{}' in the schema,
 * so an empty array is legal and must render as no image rather than a broken
 * one; the layout skips the <img> entirely when imageUrl is null.
 */
function toEmailListing(listing: Listing): EmailListing {
  return {
    title: listing.title,
    imageUrl: listing.photo_urls?.[0] ?? null,
    condition: listing.condition,
  };
}

async function loadMeetup(meetupId: string): Promise<MeetupRow | null> {
  const admin = createAdminSupabaseClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from("meetups")
    .select(
      `id, status, offered_price, meetup_window_start, meetup_window_end, meetup_location,
       buyer:users!buyer_id(id, email, full_name, phone, stripe_payouts_enabled),
       seller:users!seller_id(id, email, full_name, phone, stripe_payouts_enabled),
       listing:listings!listing_id(id, title, retail_price, photo_urls, condition)`,
    )
    .eq("id", meetupId)
    .single();
  if (error || !data) {
    console.error("[notify] loadMeetup failed", error);
    return null;
  }
  return data as unknown as MeetupRow;
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as Payload;
    const { event } = body;

    if (event === "meetup_requested" || event === "meetup_accepted" || event === "meetup_declined") {
      if (!body.meetupId) {
        return Response.json({ error: "meetupId required" }, { status: 400 });
      }
      const m = await loadMeetup(body.meetupId);
      if (!m) {
        return Response.json({ error: "meetup not found" }, { status: 404 });
      }
      // Authorization: caller must be buyer or seller on the meetup
      if (m.buyer?.id !== user.id && m.seller?.id !== user.id) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      const buyer = m.buyer;
      const seller = m.seller;
      const listing = m.listing;
      if (!buyer || !seller || !listing) {
        return Response.json({ ok: false, error: "missing parties" });
      }

      const location = parseLocation(m.meetup_location);
      const dateLine = formatDateLine(
        m.meetup_window_start,
        m.meetup_window_end,
      );
      const offered = m.offered_price ?? 0;
      const meetupHref = `/meetups/${m.id}`;
      const emailListing = toEmailListing(listing);
      const meetupContext = {
        meetupId: m.id,
        dateLine,
        zoneName: location.name,
        zoneAddress: location.address,
      };

      if (event === "meetup_requested") {
        await Promise.all([
          // The most time-sensitive event in the product. It previously reached
          // the seller only by SMS (Twilio is unconfigured outside production)
          // and an in-app notice that does not alert in real time — so a seller
          // could miss an offer entirely.
          sendNewRequestEmail({
            seller: { email: seller.email, fullName: seller.full_name },
            buyer: { email: buyer.email, fullName: buyer.full_name },
            listing: emailListing,
            meetup: meetupContext,
            offeredPriceCents: offered,
            // Rides an email the seller will definitely open, instead of a
            // standalone nudge that would go to a young domain's spam folder.
            sellerPayoutsEnabled: Boolean(seller.stripe_payouts_enabled),
          }),
          sendNewRequestSMS({
            sellerPhone: seller.phone,
            buyerName: (buyer.full_name || "").split(" ")[0] || "A buyer",
            listingTitle: listing.title,
            offeredPrice: offered,
            meetupId: m.id,
          }),
          createNotification({
            userId: seller.id,
            type: "meetup_request",
            title: "New meetup request",
            body: `${(buyer.full_name || "Someone").split(" ")[0]} wants to buy your ${listing.title} for $${(offered / 100).toFixed(0)}.`,
            link: meetupHref,
          }),
        ]);
      } else if (event === "meetup_accepted") {
        await Promise.all([
          sendMeetupScheduledEmails({
            buyer: { email: buyer.email, fullName: buyer.full_name },
            seller: { email: seller.email, fullName: seller.full_name },
            listing: emailListing,
            meetup: meetupContext,
            offeredPriceCents: offered,
            sellerPayoutsEnabled: Boolean(seller.stripe_payouts_enabled),
          }),
          sendMeetupAcceptedSMS({
            buyerPhone: buyer.phone,
            listingTitle: listing.title,
            dateLine,
            zoneName: location.name,
            zoneAddress: location.address,
            meetupId: m.id,
          }),
          createNotification({
            userId: buyer.id,
            type: "meetup_accepted",
            title: "Meetup confirmed",
            body: `${(seller.full_name || "The seller").split(" ")[0]} accepted your request for ${listing.title}.`,
            link: meetupHref,
          }),
          createNotification({
            userId: seller.id,
            type: "meetup_accepted",
            title: "You accepted a meetup",
            body: `Confirmed for ${dateLine} at ${location.name}.`,
            link: meetupHref,
          }),
        ]);
      } else if (event === "meetup_declined") {
        await Promise.all([
          sendRequestDeclinedEmail({
            buyer: { email: buyer.email, fullName: buyer.full_name },
            seller: { email: seller.email, fullName: seller.full_name },
            listing: emailListing,
            listingId: listing.id,
            offeredPriceCents: offered,
          }),
          createNotification({
            userId: buyer.id,
            type: "meetup_declined",
            title: "Request declined",
            body: `Your request for ${listing.title} was declined. The listing is back to active.`,
            link: `/listings/${listing.id}`,
          }),
        ]);
      }

      return Response.json({ ok: true });
    }

    if (event === "transaction_complete") {
      if (!body.transactionId) {
        return Response.json(
          { error: "transactionId required" },
          { status: 400 },
        );
      }
      const admin = createAdminSupabaseClient();
      if (!admin) {
        return Response.json({ ok: false, error: "no service role" });
      }
      // The order join is what makes the buyer's receipt correct. `transactions`
      // stores gross_amount = the ITEM price; the buyer's card was charged
      // gross_captured_cents = item + Buyer Protection fee, which lives only on
      // the order. Migration 015's own comment says to join here for the full
      // breakdown — before this, the receipt understated the charge by our fee.
      const { data: tx, error: txErr } = await admin
        .from("transactions")
        .select(
          `id, meetup_id, order_id, gross_amount, platform_fee, net_amount, retail_price, created_at,
           buyer:users!buyer_id(id, email, full_name),
           seller:users!seller_id(id, email, full_name, is_founding_member),
           listing:listings!listing_id(id, title, photo_urls, condition),
           order:orders!order_id(id, item_price_cents, buyer_fee_cents, seller_fee_cents, gross_captured_cents),
           meetup:meetups!meetup_id(id, meetup_location, meetup_window_start, meetup_window_end, completed_at)`,
        )
        .eq("id", body.transactionId)
        .single();
      if (txErr || !tx) {
        console.error("[notify] transaction lookup failed", txErr);
        return Response.json({ error: "tx not found" }, { status: 404 });
      }
      const t = tx as unknown as {
        id: string;
        meetup_id: string | null;
        order_id: string | null;
        gross_amount: number;
        platform_fee: number;
        net_amount: number;
        retail_price: number | null;
        created_at: string | null;
        buyer: Party | null;
        seller: (Party & { is_founding_member: boolean | null }) | null;
        listing: Listing | null;
        order: {
          id: string;
          item_price_cents: number;
          buyer_fee_cents: number;
          seller_fee_cents: number;
          gross_captured_cents: number;
        } | null;
        meetup: {
          id: string;
          meetup_location: string | null;
          meetup_window_start: string | null;
          meetup_window_end: string | null;
          completed_at: string | null;
        } | null;
      };
      if (t.buyer?.id !== user.id && t.seller?.id !== user.id) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!t.buyer || !t.seller || !t.listing) {
        return Response.json({ ok: false, error: "missing parties" });
      }

      // transactions.order_id is ON DELETE SET NULL and predates the payments
      // phases, so a missing order is possible. Fall back to the ledger figures
      // and derive the buyer fee rather than skipping the email — but never
      // pretend a derived total is a captured one when we have the real column.
      const money = t.order
        ? {
            itemPriceCents: t.order.item_price_cents,
            buyerFeeCents: t.order.buyer_fee_cents,
            grossCapturedCents: t.order.gross_captured_cents,
            sellerFeeCents: t.order.seller_fee_cents,
            payoutCents: t.order.item_price_cents - t.order.seller_fee_cents,
          }
        : {
            itemPriceCents: t.gross_amount,
            buyerFeeCents: Math.round(t.gross_amount * 0.1),
            grossCapturedCents: t.gross_amount + Math.round(t.gross_amount * 0.1),
            sellerFeeCents: t.platform_fee,
            payoutCents: t.net_amount,
          };
      if (!t.order) {
        console.warn(
          `[notify] transaction ${t.id} has no order row; receipt totals derived from the ledger`,
        );
      }

      const location = t.meetup ? parseLocation(t.meetup.meetup_location) : null;

      await Promise.all([
        sendTransactionCompleteEmails({
          buyer: { email: t.buyer.email, fullName: t.buyer.full_name },
          seller: { email: t.seller.email, fullName: t.seller.full_name },
          listing: toEmailListing(t.listing),
          money,
          orderId: t.order_id ?? t.id,
          transactionId: t.id,
          meetupId: t.meetup_id,
          meetup:
            t.meetup && location
              ? {
                  meetupId: t.meetup.id,
                  dateLine: formatDateLine(
                    t.meetup.meetup_window_start,
                    t.meetup.meetup_window_end,
                  ),
                  zoneName: location.name,
                  zoneAddress: location.address,
                }
              : null,
          metOn: formatDateOnly(t.meetup?.completed_at ?? t.created_at),
          retailPriceCents: t.retail_price,
          sellerIsFounding: t.seller.is_founding_member ?? false,
        }),
        createNotification({
          userId: t.seller.id,
          type: "transaction_complete",
          title: "Sale complete 💰",
          body: `Your sale of ${t.listing.title} closed for $${(money.itemPriceCents / 100).toFixed(0)}.`,
          link: `/profile/transactions/${t.id}`,
        }),
        createNotification({
          userId: t.buyer.id,
          type: "transaction_complete",
          title: "Purchase complete 🏅",
          body: `Enjoy your new ${t.listing.title}! Leave a review for the seller.`,
          link: `/reviews/${t.meetup_id}`,
        }),
      ]);

      return Response.json({ ok: true });
    }

    return Response.json({ error: "unknown event" }, { status: 400 });
  } catch (err) {
    console.error("[notify:trigger] error", err);
    Sentry.captureException(err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
