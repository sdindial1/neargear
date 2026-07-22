import * as Sentry from "@sentry/nextjs";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import {
  getOrCreateConnectedAccount,
  createOnboardingLink,
  appBaseUrl,
} from "@/lib/stripe-connect";

export const runtime = "nodejs";

/**
 * GET /api/stripe/connect/refresh
 * This is the Account Link `refresh_url`. Stripe sends the seller's browser here
 * when an onboarding link has expired or needs restarting. We mint a fresh link
 * and redirect straight back into the hosted flow. Browser navigation → GET.
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // Not signed in (e.g. session lapsed mid-onboarding) — bounce to wallet,
    // which is AuthGate-protected and will prompt sign-in.
    if (!user) redirect(`${appBaseUrl()}/profile/wallet`);

    const admin = createAdminSupabaseClient();
    if (!admin) redirect(`${appBaseUrl()}/profile/wallet?connect=error`);

    const accountId = await getOrCreateConnectedAccount(admin, {
      id: user.id,
      email: user.email ?? null,
    });
    const url = await createOnboardingLink(accountId);
    redirect(url);
  } catch (err) {
    // next/navigation redirect() throws a control-flow signal — re-throw it.
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest?: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    console.error("[stripe/connect/refresh] error", err);
    Sentry.captureException(err);
    redirect(`${appBaseUrl()}/profile/wallet?connect=error`);
  }
}
