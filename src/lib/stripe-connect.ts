import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";

/**
 * Shared helpers for seller Stripe Connect (Express) onboarding — Phase 1.
 * Buyer payments / transfers / payouts are later phases and live elsewhere.
 */

export interface ConnectStatus {
  connected: boolean; // a Stripe account exists for this seller
  onboardingComplete: boolean; // details_submitted
  payoutsEnabled: boolean; // payouts_enabled — safe to pay this seller
  accountId: string | null;
}

/** Absolute app origin for building Stripe redirect URLs. */
export function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://near-gear.com";
}

/**
 * Create-or-retrieve the seller's Stripe Express account id.
 *
 * If the user already has stripe_account_id, returns it. Otherwise creates a
 * fresh Express account (US, transfers capability) and persists the id via the
 * provided admin (service-role) client, then returns it.
 *
 * `admin` must be a service-role client — this writes users.stripe_account_id.
 */
export async function getOrCreateConnectedAccount(
  admin: SupabaseClient,
  user: { id: string; email: string | null },
): Promise<string> {
  const { data: profile, error } = await admin
    .from("users")
    .select("stripe_account_id")
    .eq("id", user.id)
    .single();
  if (error) throw new Error(`Failed to load user: ${error.message}`);

  if (profile?.stripe_account_id) return profile.stripe_account_id as string;

  const stripe = getStripe();
  const account = await stripe.accounts.create({
    type: "express",
    country: "US",
    email: user.email ?? undefined,
    capabilities: {
      transfers: { requested: true },
    },
    business_type: "individual",
    metadata: { neargear_user_id: user.id },
  });

  const { error: updateErr } = await admin
    .from("users")
    .update({ stripe_account_id: account.id })
    .eq("id", user.id);
  if (updateErr) {
    // We created a Stripe account but couldn't persist the id. Surface loudly —
    // the next attempt would otherwise create a duplicate orphan account.
    throw new Error(
      `Created Stripe account ${account.id} but failed to save it: ${updateErr.message}`,
    );
  }

  return account.id;
}

/** Generate an onboarding Account Link for the given connected account. */
export async function createOnboardingLink(
  accountId: string,
): Promise<string> {
  const stripe = getStripe();
  const base = appBaseUrl();
  const link = await stripe.accountLinks.create({
    account: accountId,
    // refresh_url is hit if the link expires or the seller needs to restart —
    // it re-generates a fresh link (see /api/stripe/connect/refresh).
    refresh_url: `${base}/api/stripe/connect/refresh`,
    // return_url is where Stripe sends the seller when they finish/leave the
    // hosted flow. The wallet page syncs status on arrival.
    return_url: `${base}/profile/wallet?connect=return`,
    type: "account_onboarding",
  });
  return link.url;
}

/**
 * Derive Connect status from a Stripe Account object and persist the two
 * boolean flags. Returns the normalized status. Used by both the webhook
 * (account.updated) and the on-demand status sync so DB and Stripe agree.
 */
export async function syncAccountStatus(
  admin: SupabaseClient,
  account: Stripe.Account,
): Promise<ConnectStatus> {
  const onboardingComplete = Boolean(account.details_submitted);
  const payoutsEnabled = Boolean(account.payouts_enabled);

  const { error } = await admin
    .from("users")
    .update({
      stripe_onboarding_complete: onboardingComplete,
      stripe_payouts_enabled: payoutsEnabled,
    })
    .eq("stripe_account_id", account.id);
  if (error) {
    throw new Error(`Failed to sync Stripe status: ${error.message}`);
  }

  return {
    connected: true,
    onboardingComplete,
    payoutsEnabled,
    accountId: account.id,
  };
}
