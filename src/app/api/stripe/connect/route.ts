import * as Sentry from "@sentry/nextjs";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { isStripeConfigured } from "@/lib/stripe";
import {
  getOrCreateConnectedAccount,
  createOnboardingLink,
} from "@/lib/stripe-connect";

export const runtime = "nodejs";

/**
 * POST /api/stripe/connect
 * Seller initiates (or resumes) Stripe Express onboarding. Creates-or-retrieves
 * their connected account, generates a hosted Account Link, and returns the URL
 * for the client to redirect to. Phase 1 — no money moves here.
 */
export async function POST() {
  try {
    if (!isStripeConfigured()) {
      return Response.json(
        { error: "Stripe is not configured." },
        { status: 500 },
      );
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
      return Response.json(
        { error: "Service role not configured" },
        { status: 500 },
      );
    }

    const accountId = await getOrCreateConnectedAccount(admin, {
      id: user.id,
      email: user.email ?? null,
    });
    const url = await createOnboardingLink(accountId);

    return Response.json({ url });
  } catch (err) {
    console.error("[stripe/connect] error", err);
    Sentry.captureException(err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
