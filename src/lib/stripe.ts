import Stripe from "stripe";

/**
 * Server-only Stripe client (TEST MODE in Phase 1).
 *
 * Reads STRIPE_SECRET_KEY (sk_test_... for now). The key has NO `NEXT_PUBLIC_`
 * prefix, so Next never inlines it into a client bundle — the secret cannot
 * reach the browser. Import this module only from route handlers / server code.
 *
 * Constructed lazily so a missing key surfaces as a clear runtime error in the
 * route that needs it, rather than crashing unrelated server code at import.
 */
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it to .env.local (test mode: sk_test_...).",
    );
  }

  // apiVersion intentionally omitted — pins to the version bundled with the
  // installed `stripe` SDK, which keeps the TS types and runtime in lockstep.
  _stripe = new Stripe(secretKey, {
    appInfo: { name: "NearGear", url: "https://near-gear.com" },
  });
  return _stripe;
}

/** True when a Stripe secret key is configured — lets UI/routes degrade gracefully. */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
