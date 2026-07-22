import * as Sentry from "@sentry/nextjs";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { syncAccountStatus, type ConnectStatus } from "@/lib/stripe-connect";

export const runtime = "nodejs";

const DISCONNECTED: ConnectStatus = {
  connected: false,
  onboardingComplete: false,
  payoutsEnabled: false,
  accountId: null,
};

/**
 * GET /api/stripe/connect/status
 * Returns the seller's current Connect status. If they have a Stripe account we
 * retrieve it live from Stripe and re-sync the DB flags — so the wallet page
 * reflects reality immediately on return_url landing, without waiting for the
 * account.updated webhook. Never exposes the raw acct_ id to the client.
 */
export async function GET() {
  try {
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

    const { data: profile } = await admin
      .from("users")
      .select(
        "stripe_account_id, stripe_onboarding_complete, stripe_payouts_enabled",
      )
      .eq("id", user.id)
      .single();

    const accountId = profile?.stripe_account_id as string | null | undefined;
    if (!accountId) {
      return Response.json(DISCONNECTED);
    }

    // Try to reconcile with Stripe live. If Stripe is unreachable/unconfigured,
    // fall back to the last-known DB flags rather than erroring the UI.
    if (isStripeConfigured()) {
      try {
        const account = await getStripe().accounts.retrieve(accountId);
        const status = await syncAccountStatus(admin, account);
        return Response.json({ ...status, accountId: null });
      } catch (syncErr) {
        console.error("[stripe/connect/status] live sync failed", syncErr);
        Sentry.captureException(syncErr);
      }
    }

    return Response.json({
      connected: true,
      onboardingComplete: Boolean(profile?.stripe_onboarding_complete),
      payoutsEnabled: Boolean(profile?.stripe_payouts_enabled),
      accountId: null,
    });
  } catch (err) {
    console.error("[stripe/connect/status] error", err);
    Sentry.captureException(err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
