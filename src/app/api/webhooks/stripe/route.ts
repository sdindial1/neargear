import type Stripe from "stripe";
import * as Sentry from "@sentry/nextjs";
import { getStripe } from "@/lib/stripe";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { syncAccountStatus } from "@/lib/stripe-connect";

// Node runtime + no caching: we need the raw request body and Node crypto for
// Stripe signature verification. Never run this on the edge or prerender it.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/stripe
 * Stripe webhook receiver.
 *   - account.updated (Phase 1) → flip Connect onboarding/payouts flags.
 *   - checkout.session.completed (Phase 2) → mark the order 'paid_held' and
 *     record the captured PaymentIntent.
 * Other event types are acknowledged and ignored for now.
 *
 * Signature verification uses the RAW request body (req.text()) — do not parse
 * or re-serialize the body first, or the signature check will fail.
 *
 * Local testing:
 *   stripe listen --forward-to localhost:3000/api/webhooks/stripe
 * copy the printed whsec_... into STRIPE_WEBHOOK_SECRET in .env.local.
 */
export async function POST(req: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[webhooks/stripe] STRIPE_WEBHOOK_SECRET is not set");
    return Response.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "Missing signature" }, { status: 400 });
  }

  // Raw body — required for signature verification.
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret,
    );
  } catch (err) {
    console.error("[webhooks/stripe] signature verification failed", err);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        const admin = createAdminSupabaseClient();
        if (!admin) {
          // Can't persist — return 500 so Stripe retries later.
          console.error("[webhooks/stripe] service role not configured");
          return Response.json({ error: "Service role" }, { status: 500 });
        }
        await syncAccountStatus(admin, account);
        break;
      }
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        // Only act once the payment actually cleared.
        if (session.payment_status !== "paid") break;

        const admin = createAdminSupabaseClient();
        if (!admin) {
          console.error("[webhooks/stripe] service role not configured");
          return Response.json({ error: "Service role" }, { status: 500 });
        }

        const orderId =
          session.metadata?.order_id || session.client_reference_id || null;
        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : (session.payment_intent?.id ?? null);
        const grossCaptured = session.amount_total ?? 0;

        // Idempotent: match the pending order by id (fallback: session id) and
        // only advance it from 'pending'. A duplicate delivery is a no-op.
        const query = admin
          .from("orders")
          .update({
            status: "paid_held",
            gross_captured_cents: grossCaptured,
            stripe_payment_intent_id: paymentIntentId,
            stripe_checkout_session_id: session.id,
            paid_at: new Date(event.created * 1000).toISOString(),
          })
          .eq("status", "pending");

        const { error: updErr } = orderId
          ? await query.eq("id", orderId)
          : await query.eq("stripe_checkout_session_id", session.id);

        if (updErr) {
          console.error("[webhooks/stripe] order update failed", updErr);
          return Response.json({ error: "order_update_failed" }, { status: 500 });
        }
        break;
      }
      default:
        // Not handled in Phase 1 — acknowledge so Stripe stops retrying.
        break;
    }

    return Response.json({ received: true });
  } catch (err) {
    console.error("[webhooks/stripe] handler error", err);
    Sentry.captureException(err);
    // 500 → Stripe will retry with backoff.
    return Response.json({ error: "handler_failed" }, { status: 500 });
  }
}
