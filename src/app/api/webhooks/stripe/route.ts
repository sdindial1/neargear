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
 * Stripe webhook receiver. Phase 1 handles only `account.updated` — flipping
 * stripe_onboarding_complete / stripe_payouts_enabled as Connect accounts move
 * through onboarding. Other event types are acknowledged and ignored for now.
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
