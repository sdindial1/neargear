"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PartyPopper, X } from "lucide-react";
import { PayoutSetupButton, usePayoutStatus } from "@/components/payout-setup";

/**
 * Shown once, right after a listing publishes, to the seller who published it.
 *
 * This is the moment payouts are worth explaining: the listing exists, the
 * seller can picture it selling, and nothing is blocked yet. Prompting here
 * attaches the ask to motivation instead of gating the easy action — listing
 * stays completely ungated, as it should.
 *
 * Gated on `?new=1`, which only /sell sets on its post-publish redirect. A
 * visitor who somehow arrives with that param sees their OWN payout status,
 * which is harmless — /api/stripe/connect/status is always scoped to the
 * caller and never reveals anything about the listing's seller.
 */
export function PostListingPayoutPrompt() {
  const params = useSearchParams();
  const { status, loading } = usePayoutStatus();
  const [dismissed, setDismissed] = useState(false);

  /**
   * Captured ONCE, on first render — deliberately not derived from live params.
   *
   * Next patches window.history.replaceState so that useSearchParams() reflects
   * it. Reading the param on every render therefore raced the effect below:
   * first paint returned null because the payout status was still loading, the
   * effect stripped `new`, the re-render saw isNew === false, and the prompt
   * never appeared at all. Freezing the value here is what makes it survive its
   * own cleanup.
   */
  const [isNew] = useState(() => params.get("new") === "1");

  // Drop ?new=1 from the URL so a refresh or a shared link doesn't replay the
  // prompt. Runs regardless of payout state — the param has done its job.
  useEffect(() => {
    if (!isNew) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("new");
    window.history.replaceState({}, "", url.toString());
  }, [isNew]);

  if (!isNew || dismissed || loading || !status || status.payoutsEnabled) {
    return null;
  }

  const resuming = status.connected && !status.onboardingComplete;

  return (
    <div className="relative mb-4 rounded-2xl border border-orange/25 bg-orange/5 p-4">
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="absolute right-2 top-2 rounded-full p-1.5 text-muted-foreground hover:bg-black/5 hover:text-navy"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-2.5 pr-6">
        <PartyPopper className="mt-0.5 h-5 w-5 shrink-0 text-orange" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-navy">Your listing is live</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Set up payouts so you get paid when this sells. It takes about 3
            minutes and you only do it once.
          </p>
          <div className="mt-3">
            <PayoutSetupButton
              status={status}
              label={resuming ? "Finish payout setup" : "Set up payouts"}
              className="btn-primary min-h-[44px] w-full sm:w-auto"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
