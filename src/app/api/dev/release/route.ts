import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { releaseOrder } from "@/lib/orders/release";
import type { ReleaseReason } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TEMPORARY — payments Phase 3 isolation harness. DELETED in Step 7.
 *
 * Lets releaseOrder() be exercised standalone, before the confirm routes
 * (Step 3) or the rewired UI (Step 4) exist. Running it as a route rather than
 * a standalone script matters: it resolves the same `@/` aliases, loads env the
 * same way, and runs in the same Node runtime as the real callers will, so
 * we're testing the actual code path rather than a lookalike.
 *
 * HARD-GUARDED: returns 404 in production, so even if this file were
 * accidentally merged and deployed it cannot move money. It is also never
 * referenced by any UI.
 *
 *   GET  /api/dev/release?orderId=<uuid>   -> inspect order + projected ledger row
 *   POST /api/dev/release {orderId, reason} -> run releaseOrder, return ReleaseResult
 */

const VALID_REASONS: ReleaseReason[] = [
  "buyer_confirmed",
  "seller_24h",
  "backstop_7d",
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
      "id, status, item_price_cents, seller_fee_cents, gross_captured_cents, " +
        "buyer_confirmed_at, seller_confirmed_at, buyer_notified_at, released_at, " +
        "release_reason, stripe_transfer_id, disputed_at, transfer_error, " +
        "transfer_attempts, meetup_id, listing_id",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return Response.json({ error: "order not found" }, { status: 404 });

  const o = order as unknown as {
    meetup_id: string | null;
    listing_id: string | null;
  };

  const { data: tx } = await admin
    .from("transactions")
    .select("id, order_id, gross_amount, platform_fee, net_amount, auto_completed, created_at")
    .eq("order_id", orderId)
    .maybeSingle();

  const { data: meetup } = await admin
    .from("meetups")
    .select("id, status, completed_at, auto_completed")
    .eq("id", o.meetup_id ?? "")
    .maybeSingle();

  const { data: listing } = await admin
    .from("listings")
    .select("id, status")
    .eq("id", o.listing_id ?? "")
    .maybeSingle();

  return Response.json({
    order,
    projected: { transaction: tx, meetup, listing },
  });
}

export async function POST(request: Request) {
  const blocked = blockedInProduction();
  if (blocked) return blocked;

  const body = (await request.json().catch(() => ({}))) as {
    orderId?: string;
    reason?: string;
  };

  if (!body.orderId) {
    return Response.json({ error: "orderId required" }, { status: 400 });
  }
  const reason = (body.reason ?? "buyer_confirmed") as ReleaseReason;
  if (!VALID_REASONS.includes(reason)) {
    return Response.json(
      { error: `reason must be one of ${VALID_REASONS.join(", ")}` },
      { status: 400 },
    );
  }

  const admin = createAdminSupabaseClient();
  if (!admin) {
    return Response.json({ error: "service role not configured" }, { status: 500 });
  }

  const result = await releaseOrder(admin, body.orderId, reason);
  // Always 200 — the ReleaseResult itself carries the outcome, and we want to
  // read `skipped` / `failed` bodies as easily as `released`.
  return Response.json(result);
}
