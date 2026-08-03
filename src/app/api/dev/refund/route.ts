import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { refundOrder } from "@/lib/orders/refund";
import { releaseOrder } from "@/lib/orders/release";
import type { RefundReason } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TEMPORARY — payments Phase 4 isolation harness. DELETE before Phase 4 merges.
 *
 * Exercises refundOrder() standalone, before the auto-refund wiring (Step 3) or
 * the admin dispute UI (Step 4) exist. A route rather than a script so it runs
 * in the same runtime, env and module graph as the real callers will.
 *
 * Also exposes releaseOrder, purely so the already-released hard-guard test can
 * be set up honestly: release an order for real, then try to refund it.
 *
 * HARD-GUARDED: 404 in production, referenced by no UI.
 *
 *   GET  /api/dev/refund?orderId=<uuid>           -> inspect order + listing
 *   POST /api/dev/refund {orderId, reason?}       -> refundOrder(...)
 *   POST /api/dev/refund {orderId, action:"release"} -> releaseOrder(...) for setup
 */

const VALID_REASONS: RefundReason[] = [
  "cancelled",
  "seller_no_show",
  "buyer_no_show",
  "dispute_upheld",
];

function blockedInProduction(): Response | null {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }
  return null;
}

export async function GET(request: Request) {
  const blocked = blockedInProduction();
  if (blocked) return blocked;

  const orderId = new URL(request.url).searchParams.get("orderId");
  if (!orderId) {
    return Response.json({ error: "orderId query param required" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  if (!admin) {
    return Response.json({ error: "service role not configured" }, { status: 500 });
  }

  const { data: order } = await admin
    .from("orders")
    .select(
      "id, status, item_price_cents, buyer_fee_cents, seller_fee_cents, " +
        "gross_captured_cents, stripe_payment_intent_id, stripe_charge_id, " +
        "stripe_refund_id, refunded_at, refund_reason, refund_error, refund_attempts, " +
        "stripe_transfer_id, released_at, disputed_at, freeze_reason, " +
        "dispute_resolution, dispute_resolved_by, listing_id, meetup_id",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return Response.json({ error: "order not found" }, { status: 404 });
  const o = order as unknown as { listing_id: string | null; meetup_id: string | null };

  const { data: listing } = await admin
    .from("listings")
    .select("id, status")
    .eq("id", o.listing_id ?? "")
    .maybeSingle();

  const { data: meetup } = await admin
    .from("meetups")
    .select("id, status")
    .eq("id", o.meetup_id ?? "")
    .maybeSingle();

  return Response.json({ order, listing, meetup });
}

export async function POST(request: Request) {
  const blocked = blockedInProduction();
  if (blocked) return blocked;

  const body = (await request.json().catch(() => ({}))) as {
    orderId?: string;
    reason?: string;
    action?: string;
  };

  if (!body.orderId) {
    return Response.json({ error: "orderId required" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  if (!admin) {
    return Response.json({ error: "service role not configured" }, { status: 500 });
  }

  // Setup path for the hard-guard test: genuinely release the order so the
  // refund attempt afterwards is against real transferred funds.
  if (body.action === "release") {
    const result = await releaseOrder(admin, body.orderId, "buyer_confirmed");
    return Response.json({ setup: "release", result });
  }

  const reason = (body.reason ?? "cancelled") as RefundReason;
  if (!VALID_REASONS.includes(reason)) {
    return Response.json(
      { error: `reason must be one of ${VALID_REASONS.join(", ")}` },
      { status: 400 },
    );
  }

  const result = await refundOrder(admin, body.orderId, reason);
  // Always 200 — the RefundResult carries the outcome, and we want to read
  // `skipped` / `manual_reversal_required` bodies as easily as `refunded`.
  return Response.json(result);
}
