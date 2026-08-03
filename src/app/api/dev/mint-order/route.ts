import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { getStripe } from "@/lib/stripe";
import { computeOrderBreakdown } from "@/lib/fees";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TEMPORARY — payments Phase 4 test fixture. DELETE before Phase 4 merges.
 *
 * Mints a fresh `paid_held` order backed by a REAL test-mode Stripe charge, in
 * a chosen state, so refund/freeze/release behaviour can be tested repeatedly.
 *
 * WHY A NEW MEETUP AND ORDER EVERY TIME
 * A charge can only be transferred against up to its own amount, so a released
 * order's charge is spent and it can never be a valid subject again. And the
 * recovery lookup keys on `transfer_group = order_<id>`, so reusing an order id
 * risks adopting a stale transfer and reporting a false success. Fresh ids
 * every mint avoids both traps.
 *
 * GUARDS: 404 when NODE_ENV is production; refuses any non-test Stripe key.
 * Neither blocks `next dev`, where NODE_ENV is "development".
 *
 *   GET  /api/dev/mint-order?state=rung2&buyerEmail=someone@example.com
 *   POST /api/dev/mint-order   { state, buyerEmail?, itemPriceCents?, windowHours? }
 *
 * `state` may be given in the query string OR the JSON body; both work on POST.
 */

type Preset =
  | "plain"
  | "early_cancel"
  | "late_cancel"
  | "dispute"
  | "noshow"
  | "rung2"
  | "rung2_negative"
  | "rung3"
  | "rung3_negative"
  | "disputed_frozen";

interface PresetShape {
  /** Meetup window start relative to now, in hours. Negative = past. */
  windowHours: number;
  /** How long ago the seller confirmed / the buyer was notified. null = neither. */
  confirmHours: number | null;
  /** Pre-freeze the order (rung 4 subject). */
  frozen: boolean;
  expectation: string;
}

const PRESETS: Record<Preset, PresetShape> = {
  plain: { windowHours: -2, confirmHours: null, frozen: false, expectation: "paid_held, not eligible for any rung" },
  early_cancel: { windowHours: 30, confirmHours: null, frozen: false, expectation: "buyer cancel is OUTSIDE 24h -> auto-refund branch" },
  late_cancel: { windowHours: 5, confirmHours: null, frozen: false, expectation: "buyer cancel is INSIDE 24h -> cancelled_late -> admin review" },
  dispute: { windowHours: -2, confirmHours: null, frozen: false, expectation: "window passed, still scheduled -> dispute is fileable" },
  noshow: { windowHours: -2, confirmHours: null, frozen: false, expectation: "window passed -> no-show reportable" },
  rung2: { windowHours: -2, confirmHours: 25, frozen: false, expectation: "ELIGIBLE now via seller_24h" },
  rung2_negative: { windowHours: -2, confirmHours: 23, frozen: false, expectation: "NOT eligible — 23h < 24h" },
  rung3: { windowHours: -8 * 24, confirmHours: null, frozen: false, expectation: "ELIGIBLE now via backstop_7d" },
  rung3_negative: { windowHours: -6 * 24, confirmHours: null, frozen: false, expectation: "NOT eligible — 6d < 7d" },
  disputed_frozen: { windowHours: -8 * 24, confirmHours: 25, frozen: true, expectation: "eligible for rungs 2 AND 3 but frozen -> must NOT release" },
};

function blockedInProduction(): Response | null {
  // Only NODE_ENV. Deliberately not VERCEL_ENV — `next dev` sets NODE_ENV to
  // "development", so local development is never blocked. Note that running a
  // local production build (`next build && next start`) WILL 404 this, which is
  // correct: it behaves exactly as it would once deployed.
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }
  return null;
}

async function mint(request: Request): Promise<Response> {
  const blocked = blockedInProduction();
  if (blocked) return blocked;

  if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
    return Response.json(
      { error: "refusing to mint: STRIPE_SECRET_KEY is not a test-mode key" },
      { status: 400 },
    );
  }

  // Params from EITHER the query string or a JSON body, so ?state=rung2 works
  // on both verbs and a body isn't required.
  const url = new URL(request.url);
  const body =
    request.method === "POST"
      ? ((await request.json().catch(() => ({}))) as Record<string, unknown>)
      : {};

  const pick = (key: string): string | null =>
    url.searchParams.get(key) ?? (body[key] == null ? null : String(body[key]));

  const state = (pick("state") ?? pick("preset") ?? "plain") as Preset;
  const shape = PRESETS[state];
  if (!shape) {
    return Response.json(
      { error: `unknown state "${state}"`, valid: Object.keys(PRESETS) },
      { status: 400 },
    );
  }

  const itemPriceCents = Number(pick("itemPriceCents") ?? 3800);
  const windowHours = Number(pick("windowHours") ?? shape.windowHours);
  const buyerEmail = pick("buyerEmail");

  const admin = createAdminSupabaseClient();
  if (!admin) {
    return Response.json({ error: "service role not configured" }, { status: 500 });
  }

  // ---- Participants -------------------------------------------------------
  const { data: sellerRow } = await admin
    .from("users")
    .select("id, email, stripe_account_id, is_founding_member")
    .not("stripe_account_id", "is", null)
    .limit(1)
    .maybeSingle();
  const seller = sellerRow as {
    id: string;
    email: string;
    stripe_account_id: string;
    is_founding_member: boolean | null;
  } | null;
  if (!seller) {
    return Response.json(
      { error: "no user has a Stripe connected account — run Connect onboarding first" },
      { status: 400 },
    );
  }

  const buyerQuery = admin.from("users").select("id, email");
  const { data: buyerRow } = buyerEmail
    ? await buyerQuery.eq("email", buyerEmail).maybeSingle()
    : await buyerQuery.neq("id", seller.id).limit(1).maybeSingle();
  const buyer = buyerRow as { id: string; email: string } | null;
  if (!buyer || buyer.id === seller.id) {
    return Response.json(
      { error: buyerEmail ? `no distinct user with email ${buyerEmail}` : "need a second user as buyer" },
      { status: 400 },
    );
  }

  // QoL: previous tests leave the listing 'sold', which would make every mint
  // after the first fail. Reactivate any of the seller's listings that a test
  // left behind, then pick one. Never touches 'removed' — that is a moderation
  // decision, not test residue.
  await admin
    .from("listings")
    .update({ status: "active" })
    .eq("seller_id", seller.id)
    .in("status", ["sold", "pending"]);

  const { data: listingRow } = await admin
    .from("listings")
    .select("id, title")
    .eq("seller_id", seller.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const listing = listingRow as { id: string; title: string } | null;
  if (!listing) {
    return Response.json(
      { error: `no active listing owned by ${seller.email} (none active, sold or pending)` },
      { status: 400 },
    );
  }

  const breakdown = computeOrderBreakdown(
    itemPriceCents,
    Boolean(seller.is_founding_member),
  );

  // ---- Real test-mode charge ---------------------------------------------
  let paymentIntentId: string;
  let chargeId: string | null = null;
  try {
    const pi = await getStripe().paymentIntents.create({
      amount: breakdown.buyerTotalCents,
      currency: "usd",
      payment_method: "pm_card_visa",
      payment_method_types: ["card"],
      confirm: true,
      description: `NearGear dev mint (${state})`,
      metadata: { dev_mint: "true", state },
    });
    if (pi.status !== "succeeded") {
      return Response.json({ error: `PaymentIntent status ${pi.status}` }, { status: 502 });
    }
    paymentIntentId = pi.id;
    chargeId =
      typeof pi.latest_charge === "string" ? pi.latest_charge : (pi.latest_charge?.id ?? null);
  } catch (err) {
    return Response.json(
      { error: "stripe_charge_failed", message: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  // ---- Fresh meetup + order ----------------------------------------------
  const now = Date.now();
  const windowStart = new Date(now + windowHours * 3_600_000);
  const windowEnd = new Date(windowStart.getTime() + 2 * 3_600_000);
  const stamp = (hoursAgo: number | null) =>
    hoursAgo === null ? null : new Date(now - hoursAgo * 3_600_000).toISOString();

  const { data: meetupRow, error: meetupErr } = await admin
    .from("meetups")
    .insert({
      listing_id: listing.id,
      buyer_id: buyer.id,
      seller_id: seller.id,
      deposit_amount: 0,
      deposit_payment_intent_id: "dev_mint", // cleanup marker
      status: "scheduled",
      meetup_window_start: windowStart.toISOString(),
      meetup_window_end: windowEnd.toISOString(),
      offered_price: itemPriceCents,
      offer_type: "full_price",
    })
    .select("id")
    .single();
  if (meetupErr || !meetupRow) {
    return Response.json(
      { error: "meetup_insert_failed", message: meetupErr?.message },
      { status: 500 },
    );
  }
  const meetupId = (meetupRow as { id: string }).id;

  const nowIso = new Date().toISOString();
  const { data: orderRow, error: orderErr } = await admin
    .from("orders")
    .insert({
      meetup_id: meetupId,
      listing_id: listing.id,
      buyer_id: buyer.id,
      seller_id: seller.id,
      item_price_cents: breakdown.itemPriceCents,
      buyer_fee_cents: breakdown.buyerFeeCents,
      seller_fee_cents: breakdown.sellerFeeCents,
      gross_captured_cents: breakdown.buyerTotalCents,
      currency: "usd",
      status: "paid_held",
      stripe_payment_intent_id: paymentIntentId,
      stripe_charge_id: chargeId,
      paid_at: nowIso,
      seller_confirmed_at: stamp(shape.confirmHours),
      buyer_notified_at: stamp(shape.confirmHours),
      disputed_at: shape.frozen ? nowIso : null,
      freeze_reason: shape.frozen ? "item_dispute" : null,
    })
    .select("id")
    .single();
  if (orderErr || !orderRow) {
    return Response.json(
      { error: "order_insert_failed", message: orderErr?.message },
      { status: 500 },
    );
  }
  const orderId = (orderRow as { id: string }).id;

  console.log(`[dev-mint] state=${state} order=${orderId} meetup=${meetupId} charge=${chargeId}`);

  return Response.json({
    ok: true,
    state,
    expectation: shape.expectation,
    orderId,
    meetupId,
    listingId: listing.id,
    buyerEmail: buyer.email,
    sellerEmail: seller.email,
    paymentIntentId,
    chargeId,
    transferGroup: `order_${orderId}`,
    money: {
      itemPriceCents: breakdown.itemPriceCents,
      buyerFeeCents: breakdown.buyerFeeCents,
      buyerPaidCents: breakdown.buyerTotalCents,
      fullRefundCents: breakdown.buyerTotalCents,
      sellerPayoutCents: breakdown.sellerPayoutCents,
    },
    windowStart: windowStart.toISOString(),
    cancelUrl: `/meetups/${meetupId}/cancel`,
    meetupUrl: `/meetups/${meetupId}`,
  });
}

export async function POST(request: Request) {
  return mint(request);
}

export async function GET(request: Request) {
  return mint(request);
}
