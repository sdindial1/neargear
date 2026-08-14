"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { PayoutSetupButton, type PayoutStatus } from "@/components/payout-setup";

/**
 * Site-wide nudge for sellers with live listings and no working payouts.
 *
 * The /welcome screen is one-time orientation; this is the part that persists.
 * A seller can list from an ad, dismiss the welcome, and never think about
 * Stripe again — and the first anyone learns of it is a buyer hitting the
 * checkout wall. This keeps coming back until it is genuinely resolved.
 *
 * Deliberately NOT a repeating full-page interstitial: that reads as broken,
 * and it would be shown to buyers who have no use for Stripe at all. It is a
 * banner, and only sellers with something listed ever see it.
 *
 * Dismissal is sessionStorage, so it clears on the next visit. localStorage
 * would make "dismiss" mean "forever", which is the behaviour we are replacing.
 */

const DISMISS_KEY = "ng:payout-banner-dismissed";

interface NudgeResponse {
  show: boolean;
  listingCount?: number;
  status?: PayoutStatus;
}

export function PayoutBanner() {
  const [data, setData] = useState<NudgeResponse | null>(null);

  /**
   * Read once during the first render rather than in an effect, so the banner
   * can never flash in for someone who already dismissed it this session.
   *
   * Defaults to dismissed on the server: there is no sessionStorage there, and
   * the component renders null on first paint either way (data is still null),
   * so the two passes agree and hydration stays clean.
   */
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      // Private mode or storage disabled — treat as not dismissed.
      return false;
    }
  });

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/seller/payout-nudge");
        if (res.ok && alive) setData((await res.json()) as NudgeResponse);
      } catch {
        // Stay silent. Never nag on a failed check.
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Dismissal just won't persist across navigations. Acceptable.
    }
  };

  if (dismissed || !data?.show || !data.status) return null;

  const resuming = data.status.connected && !data.status.onboardingComplete;

  return (
    <div className="border-b border-amber-300 bg-amber-50">
      <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />

        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-900">
              Your listings can&apos;t be purchased until you set up payouts.
            </p>
            <p className="mt-0.5 text-sm text-amber-800">
              {resuming
                ? "You started connecting your bank but didn't finish. It takes about 3 minutes."
                : "Buyers see your gear, but checkout stays blocked until Stripe has your details. About 3 minutes, one time."}
            </p>
          </div>

          <div className="shrink-0">
            <PayoutSetupButton
              status={data.status}
              label={resuming ? "Finish setup" : "Set up payouts"}
              className="btn-primary min-h-[40px] w-full sm:w-auto"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss until next visit"
          className="-mr-1 shrink-0 rounded-full p-1.5 text-amber-700 hover:bg-amber-100 hover:text-amber-900"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
