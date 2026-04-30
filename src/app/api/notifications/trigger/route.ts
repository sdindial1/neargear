import * as Sentry from "@sentry/nextjs";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import {
  sendMeetupScheduledEmails,
  sendTransactionCompleteEmails,
} from "@/lib/notifications/email";
import {
  sendMeetupAcceptedSMS,
  sendNewRequestSMS,
} from "@/lib/notifications/sms";
import { createNotification } from "@/lib/notifications/inapp";

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
  phone: string | null;
}

interface Listing {
  id: string;
  title: string;
  retail_price: number | null;
}

interface MeetupRow {
  id: string;
  status: string;
  offered_price: number | null;
  meetup_window_start: string | null;
  meetup_window_end: string | null;
  meetup_location: string | null;
  buyer: Party | null;
  seller: Party | null;
  listing: Listing | null;
}

function parseLocation(raw: string | null): {
  name: string;
  address: string;
} {
  if (!raw) return { name: "TBD", address: "Address shared in app" };
  try {
    const parsed = JSON.parse(raw) as {
      name?: string;
      address?: string;
      type?: string;
    };
    if (parsed.type === "home_seller") {
      return {
        name: "Seller's home",
        address: parsed.address || "Address shared in app",
      };
    }
    if (parsed.type === "home_buyer") {
      return {
        name: "Buyer's home",
        address: parsed.address || "Address shared in app",
      };
    }
    return {
      name: parsed.name || "Meetup location",
      address: parsed.address || "Address shared in app",
    };
  } catch {
    return { name: "Meetup location", address: "Address shared in app" };
  }
}

function formatDateLine(start: string | null, end: string | null): string {
  if (!start) return "TBD";
  const s = new Date(start);
  const datePart = s.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  if (!end) {
    return `${datePart}, ${s.toLocaleTimeString("en-US", { hour: "numeric", hour12: true })}`;
  }
  const e = new Date(end);
  return `${datePart}, ${s.toLocaleTimeString("en-US", { hour: "numeric", hour12: true })} – ${e.toLocaleTimeString("en-US", { hour: "numeric", hour12: true })}`;
}

async function loadMeetup(
  meetupId: string,
): Promise<MeetupRow | null> {
  const admin = createAdminSupabaseClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from("meetups")
    .select(
      `id, status, offered_price, meetup_window_start, meetup_window_end, meetup_location,
       buyer:users!buyer_id(id, email, full_name, phone),
       seller:users!seller_id(id, email, full_name, phone),
       listing:listings!listing_id(id, title, retail_price)`,
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

      if (event === "meetup_requested") {
        await Promise.all([
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
            meetup: {
              meetupId: m.id,
              listingTitle: listing.title,
              dateLine,
              zoneName: location.name,
              zoneAddress: location.address,
              offeredPrice: offered,
            },
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
        await createNotification({
          userId: buyer.id,
          type: "meetup_declined",
          title: "Request declined",
          body: `Your request for ${listing.title} was declined. The listing is back to active.`,
          link: `/listings/${listing.id}`,
        });
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
      const { data: tx, error: txErr } = await admin
        .from("transactions")
        .select(
          `id, meetup_id, gross_amount, platform_fee, net_amount, retail_price,
           buyer:users!buyer_id(id, email, full_name),
           seller:users!seller_id(id, email, full_name),
           listing:listings!listing_id(id, title)`,
        )
        .eq("id", body.transactionId)
        .single();
      if (txErr || !tx) {
        return Response.json({ error: "tx not found" }, { status: 404 });
      }
      const t = tx as unknown as {
        id: string;
        meetup_id: string;
        gross_amount: number;
        platform_fee: number;
        net_amount: number;
        retail_price: number | null;
        buyer: { id: string; email: string; full_name: string | null } | null;
        seller: { id: string; email: string; full_name: string | null } | null;
        listing: { id: string; title: string } | null;
      };
      if (t.buyer?.id !== user.id && t.seller?.id !== user.id) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!t.buyer || !t.seller || !t.listing) {
        return Response.json({ ok: false, error: "missing parties" });
      }

      await Promise.all([
        sendTransactionCompleteEmails({
          buyer: { email: t.buyer.email, fullName: t.buyer.full_name },
          seller: { email: t.seller.email, fullName: t.seller.full_name },
          transactionId: t.id,
          meetupId: t.meetup_id,
          listingTitle: t.listing.title,
          grossAmount: t.gross_amount,
          platformFee: t.platform_fee,
          netAmount: t.net_amount,
          retailPrice: t.retail_price,
        }),
        createNotification({
          userId: t.seller.id,
          type: "transaction_complete",
          title: "Sale complete 💰",
          body: `Your sale of ${t.listing.title} closed for $${(t.gross_amount / 100).toFixed(0)}.`,
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
