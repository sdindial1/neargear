import * as Sentry from "@sentry/nextjs";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { loadConfirmableOrder } from "@/lib/orders/confirm";
import { releaseOrder } from "@/lib/orders/release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/orders/[id]/confirm-receipt — RUNG 1 of the release ladder.
 *
 * The buyer says they have the item. This is unilateral and final: we do not
 * wait for the seller, and the payout goes out immediately. The buyer is the
 * party with something to lose, so their confirmation is the strongest signal
 * we can get that the handoff really happened.
 *
 * Ordering matters here. We stamp buyer_confirmed_at BEFORE calling
 * releaseOrder, so that if the Stripe transfer fails the confirmation is still
 * durable and the cron's retry pass (Step 5) can see "buyer confirmed but not
 * released" and try again. Releasing first and stamping after would lose the
 * buyer's confirmation on exactly the path where we most need it.
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

    const guard = await loadConfirmableOrder(admin, orderId, user.id, "buyer");
    if (!guard.ok) {
      return Response.json(
        { error: guard.error, message: guard.message },
        { status: guard.status },
      );
    }

    // Durable first. Conditional so a double-tap doesn't move the timestamp.
    await admin
      .from("orders")
      .update({ buyer_confirmed_at: new Date().toISOString() })
      .eq("id", orderId)
      .is("buyer_confirmed_at", null);

    const result = await releaseOrder(admin, orderId, "buyer_confirmed");

    if (result.outcome === "released") {
      return Response.json({
        ok: true,
        outcome: "released",
        payoutCents: result.payoutCents,
        message: "Thanks! The seller's payment is on its way.",
      });
    }

    if (result.outcome === "skipped") {
      // Almost always a double-submit that lost the CAS race to itself.
      return Response.json({
        ok: true,
        outcome: "skipped",
        reason: result.reason,
        message: "This order is already complete.",
      });
    }

    // Transfer failed. The buyer's confirmation IS recorded and the payout will
    // retry on the next sweep, so this is not a user-facing error — but we do
    // not pretend the money moved either.
    console.error(
      `[confirm-receipt] release failed for order ${orderId}: ${result.error}`,
    );
    return Response.json({
      ok: true,
      outcome: "pending_retry",
      message:
        "Thanks! We've recorded your confirmation. The seller's payment is processing and will complete shortly.",
    });
  } catch (err) {
    console.error("[confirm-receipt] error", err);
    Sentry.captureException(err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
