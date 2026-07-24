import * as Sentry from "@sentry/nextjs";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { computeOrderBreakdown } from "@/lib/fees";
import { appBaseUrl } from "@/lib/stripe-connect";

export const runtime = "nodejs";

// Shape of the meetup row we read (the admin client is untyped, so we cast).
interface CheckoutMeetup {
  id: string;
  buyer_id: string | null;
  seller_id: string | null;
  listing_id: string | null;
  offered_price: number | null;
  status: string;
  seller:
    | {
        id: string;
        stripe_payouts_enabled: boolean | null;
        is_founding_member: boolean | null;
      }
    | Array<{
        id: string;
        stripe_payouts_enabled: boolean | null;
        is_founding_member: boolean | null;
      }>
    | null;
  listing: { title: string | null } | Array<{ title: string | null }> | null;
}

/**
 * POST /api/stripe/checkout   body: { meetupId: string }
 *
 * Buyer pays the full agreed amount (item + 10% Buyer Protection fee) for an
 * ACCEPTED meetup. Creates an `orders` row (pending) and a hosted Stripe
 * Checkout Session, then returns the URL to redirect to.
 *
 * Phase 2: plain platform charge, captured immediately into NearGear's balance.
 * NO transfer_data / destination — funds are held on the platform and
 * transferred to the seller in Phase 3. The webhook flips the order to
 * 'paid_held' on checkout.session.completed.
 */
export async function POST(req: Request) {
  try {
    if (!isStripeConfigured()) {
      return Response.json({ error: "Stripe is not configured." }, { status: 500 });
    }

    const { meetupId } = await req.json().catch(() => ({ meetupId: undefined }));
    if (!meetupId || typeof meetupId !== "string") {
      return Response.json({ error: "meetupId is required" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminSupabaseClient();
    if (!admin) {
      return Response.json({ error: "Service role not configured" }, { status: 500 });
    }

    // Load the meetup with its listing + seller payout status.
    const { data: meetupRow, error: meetupErr } = await admin
      .from("meetups")
      .select(
        "id, buyer_id, seller_id, listing_id, offered_price, status, " +
          "seller:users!seller_id(id, stripe_payouts_enabled, is_founding_member), " +
          "listing:listings!listing_id(title)",
      )
      .eq("id", meetupId)
      .single();

    if (meetupErr || !meetupRow) {
      return Response.json({ error: "Meetup not found" }, { status: 404 });
    }
    const meetup = meetupRow as unknown as CheckoutMeetup;

    // Only the buyer on this meetup may pay for it.
    if (meetup.buyer_id !== user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    // Payment happens only AFTER the seller accepts (status 'scheduled').
    if (meetup.status !== "scheduled") {
      return Response.json(
        {
          error: "not_payable",
          message:
            "This meetup isn't ready for payment. The seller must accept your offer first.",
        },
        { status: 409 },
      );
    }

    const seller = Array.isArray(meetup.seller) ? meetup.seller[0] : meetup.seller;
    const listing = Array.isArray(meetup.listing)
      ? meetup.listing[0]
      : meetup.listing;

    // Guard: can't buy if the seller can't be paid out.
    if (!seller?.stripe_payouts_enabled) {
      return Response.json(
        {
          error: "seller_not_ready",
          message:
            "The seller hasn't finished setting up payouts yet, so checkout isn't available. Please check back soon.",
        },
        { status: 409 },
      );
    }

    // Guard: already paid?
    const { data: existingPaid } = await admin
      .from("orders")
      .select("id")
      .eq("meetup_id", meetupId)
      .eq("status", "paid_held")
      .maybeSingle();
    if (existingPaid) {
      return Response.json(
        { error: "already_paid", message: "This order has already been paid." },
        { status: 409 },
      );
    }

    const itemPriceCents = meetup.offered_price ?? 0;
    if (itemPriceCents <= 0) {
      return Response.json({ error: "Invalid item price" }, { status: 400 });
    }

    const breakdown = computeOrderBreakdown(
      itemPriceCents,
      Boolean(seller?.is_founding_member),
    );

    // Create the pending order first so the webhook has a row to flip.
    const { data: order, error: orderErr } = await admin
      .from("orders")
      .insert({
        meetup_id: meetupId,
        listing_id: meetup.listing_id,
        buyer_id: meetup.buyer_id,
        seller_id: meetup.seller_id,
        item_price_cents: breakdown.itemPriceCents,
        buyer_fee_cents: breakdown.buyerFeeCents,
        seller_fee_cents: breakdown.sellerFeeCents,
        currency: "usd",
        status: "pending",
      })
      .select("id")
      .single();
    if (orderErr || !order) {
      console.error("[stripe/checkout] order insert failed", orderErr);
      return Response.json({ error: "Could not create order" }, { status: 500 });
    }

    const base = appBaseUrl();
    const itemTitle = listing?.title || "NearGear item";

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: breakdown.itemPriceCents,
            product_data: { name: itemTitle },
          },
        },
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: breakdown.buyerFeeCents,
            product_data: { name: "Buyer Protection fee" },
          },
        },
      ],
      client_reference_id: order.id,
      metadata: {
        order_id: order.id,
        meetup_id: meetupId,
        buyer_id: meetup.buyer_id ?? "",
        seller_id: meetup.seller_id ?? "",
      },
      // Attach metadata to the PaymentIntent too, so the charge is traceable
      // to the order even from the payments dashboard.
      payment_intent_data: {
        metadata: { order_id: order.id, meetup_id: meetupId },
      },
      success_url: `${base}/meetups/${meetupId}?paid=1`,
      cancel_url: `${base}/meetups/${meetupId}?paid=0`,
    });

    // Record the session id so the webhook can correlate.
    await admin
      .from("orders")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", order.id);

    return Response.json({ url: session.url });
  } catch (err) {
    console.error("[stripe/checkout] error", err);
    Sentry.captureException(err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
