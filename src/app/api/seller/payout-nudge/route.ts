import * as Sentry from "@sentry/nextjs";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/seller/payout-nudge
 *
 * Should the site-wide payout banner show for the current user?
 *
 * Two conditions, both required:
 *   - they have at least one live listing (a buyer could be trying to buy it)
 *   - their payouts are not enabled (so that buyer cannot actually pay)
 *
 * Buyers never see it: no listings, no banner.
 *
 * DELIBERATELY DOES NOT CALL STRIPE. /api/stripe/connect/status retrieves the
 * account live on every request, which is right for the wallet page and wrong
 * for something that fires on every page load for every signed-in user. This
 * reads the DB flags the account.updated webhook maintains instead. The cost is
 * a short window after a seller finishes onboarding where the banner may still
 * show; landing on the wallet re-syncs and clears it.
 *
 * "Live" means active OR pending. Pending matters: sending a buy request flips
 * the listing to pending (listings/[id]/request/page.tsx), so an active-only
 * check would hide the banner at the exact moment a real buyer is waiting.
 */
const LIVE_STATUSES = ["active", "pending"];

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // Signed out is not an error here — the banner simply doesn't apply.
    if (!user) return Response.json({ show: false });

    const admin = createAdminSupabaseClient();
    if (!admin) return Response.json({ show: false });

    const [{ data: profile }, { count: liveListings }] = await Promise.all([
      admin
        .from("users")
        .select(
          "stripe_account_id, stripe_onboarding_complete, stripe_payouts_enabled",
        )
        .eq("id", user.id)
        .maybeSingle(),
      admin
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", user.id)
        .in("status", LIVE_STATUSES),
    ]);

    const row = profile as {
      stripe_account_id: string | null;
      stripe_onboarding_complete: boolean | null;
      stripe_payouts_enabled: boolean | null;
    } | null;

    const payoutsEnabled = Boolean(row?.stripe_payouts_enabled);
    const show = (liveListings ?? 0) > 0 && !payoutsEnabled;

    return Response.json({
      show,
      listingCount: liveListings ?? 0,
      status: {
        connected: Boolean(row?.stripe_account_id),
        onboardingComplete: Boolean(row?.stripe_onboarding_complete),
        payoutsEnabled,
        accountId: null,
      },
    });
  } catch (err) {
    console.error("[seller/payout-nudge] error", err);
    Sentry.captureException(err);
    // Fail closed: a broken check must never nag someone who is fully set up.
    return Response.json({ show: false });
  }
}
