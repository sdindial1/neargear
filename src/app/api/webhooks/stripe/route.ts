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
 * TWO SIGNING SECRETS, ONE URL
 * Stripe routes v1 `account.updated` to destinations scoped to "Connected
 * accounts", and `checkout.session.completed` to destinations scoped to "Your
 * account". They cannot be combined, so production has two destinations
 * pointing at this same URL, each with its own signing secret:
 *
 *   STRIPE_WEBHOOK_SECRET          "Your account"       checkout.session.completed
 *   STRIPE_WEBHOOK_SECRET_CONNECT  "Connected accounts" account.updated
 *
 * We try each in turn. The second is OPTIONAL, so `stripe listen` locally with
 * a single secret still works unchanged.
 *
 * Verifying against only one secret silently breaks the other destination. With
 * just the account secret, `account.updated` never validates, so
 * `stripe_payouts_enabled` never flips — and that flag gates both the buyer's
 * Pay button and the checkout route's `seller_not_ready` guard. A seller who
 * finished onboarding would stay permanently unsellable, with no error anywhere
 * except a signature-verification line in the logs.
 *
 * Local testing:
 *   stripe listen --forward-to localhost:3000/api/webhooks/stripe
 * copy the printed whsec_... into STRIPE_WEBHOOK_SECRET in .env.local.
 */

/**
 * Verify against each configured secret, returning the first that validates.
 *
 * On timing: Stripe's constructEvent does the HMAC comparison in constant time,
 * and we never compare secrets ourselves. Trying secrets sequentially does mean
 * a valid-for-the-second-secret request takes marginally longer than an invalid
 * one — but that only reveals which destination sent the event, which the event
 * type already tells you. No secret material is discoverable from it.
 *
 * Errors are deliberately not returned to the caller and the secrets are never
 * logged; only the count of attempts is.
 */
function verifySignature(
  rawBody: string,
  signature: string,
  secrets: string[],
): Stripe.Event | null {
  const stripe = getStripe();
  for (const secret of secrets) {
    try {
      return stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      // Wrong secret for this destination, or a forgery. Try the next.
    }
  }
  return null;
}

export async function POST(req: Request) {
  // Order matters only for efficiency: the account secret handles the far more
  // frequent checkout events, so it goes first.
  const secrets = [
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_WEBHOOK_SECRET_CONNECT,
  ].filter((s): s is string => Boolean(s));

  if (secrets.length === 0) {
    console.error(
      "[webhooks/stripe] no signing secret configured (STRIPE_WEBHOOK_SECRET)",
    );
    return Response.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "Missing signature" }, { status: 400 });
  }

  // Raw body — required for signature verification.
  const rawBody = await req.text();

  const event = verifySignature(rawBody, signature, secrets);
  if (!event) {
    // Never echo the signature or any secret. The attempt count is the only
    // detail that helps diagnose a misconfiguration.
    console.error(
      `[webhooks/stripe] signature verification failed against ${secrets.length} configured secret(s)`,
    );
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

        // Resolve and persist the charge now, while we're already handling this
        // payment. releaseOrder needs it for `source_transaction` and otherwise
        // re-derives it from the PaymentIntent on EVERY release — an avoidable
        // Stripe round-trip on the money path. Best-effort: a failure here must
        // not stop the order reaching paid_held, and releaseOrder still falls
        // back to deriving it.
        let chargeId: string | null = null;
        if (paymentIntentId) {
          try {
            const pi = await getStripe().paymentIntents.retrieve(paymentIntentId);
            chargeId =
              typeof pi.latest_charge === "string"
                ? pi.latest_charge
                : (pi.latest_charge?.id ?? null);
          } catch (err) {
            console.warn(
              `[webhooks/stripe] could not resolve charge for ${paymentIntentId}`,
              err,
            );
          }
        }

        // Idempotent: match the pending order by id (fallback: session id) and
        // only advance it from 'pending'. A duplicate delivery is a no-op.
        const query = admin
          .from("orders")
          .update({
            status: "paid_held",
            gross_captured_cents: grossCaptured,
            stripe_payment_intent_id: paymentIntentId,
            stripe_charge_id: chargeId,
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
