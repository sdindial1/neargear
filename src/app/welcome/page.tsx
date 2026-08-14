import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { safeRedirect } from "@/lib/safe-redirect";
import { WelcomeClient } from "./welcome-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Welcome to NearGear",
};

/**
 * First-run experience, shown once immediately after signup.
 *
 * Eligibility is decided HERE, on the server, before anything renders — so
 * visiting /welcome directly can never show a returning seller a "getting
 * started" screen. Three independent disqualifiers, any one of which means
 * this person is not new:
 *
 *   - onboarding_completed_at is set  (they've seen it, on any device)
 *   - they already have a listing     (they've done the main action)
 *   - they have a Stripe account      (they've done the hard action)
 *
 * The last two matter for users who predate the column: everyone existing has
 * a NULL timestamp, and without those checks they'd all be greeted as new.
 */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Same guard as the auth pages — this value ends up in a client-side
  // navigation, so it must never carry an absolute URL.
  const nextPath = safeRedirect(next, "/marketplace");

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not signed in? Nothing to onboard. Send them to browse.
  if (!user) redirect("/marketplace");

  const admin = createAdminSupabaseClient();
  // Without the service role we cannot check eligibility, and showing the
  // welcome to the wrong person is worse than skipping it.
  if (!admin) redirect(nextPath);

  const [{ data: profile }, { count: listingCount }] = await Promise.all([
    admin
      .from("users")
      .select("full_name, onboarding_completed_at, stripe_account_id")
      .eq("id", user.id)
      .maybeSingle(),
    admin
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("seller_id", user.id),
  ]);

  const row = profile as {
    full_name: string | null;
    onboarding_completed_at: string | null;
    stripe_account_id: string | null;
  } | null;

  if (
    row?.onboarding_completed_at ||
    row?.stripe_account_id ||
    (listingCount ?? 0) > 0
  ) {
    redirect(nextPath);
  }

  const firstName = row?.full_name?.trim().split(/\s+/)[0] || null;

  return <WelcomeClient firstName={firstName} nextPath={nextPath} />;
}
