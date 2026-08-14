"use client";

import { AlertTriangle } from "lucide-react";
import { PayoutSetupButton, usePayoutStatus } from "@/components/payout-setup";

/**
 * Warns a seller that their payouts aren't set up, at the two moments it costs
 * them a sale: responding to a request, and after the meetup is scheduled.
 *
 * WHY THIS EXISTS. The only thing that ever checked payout status was the
 * buyer's checkout, which 409s with `seller_not_ready`. That put the failure on
 * the person who cannot fix it, days after the seller could have. Listing and
 * accepting stay deliberately ungated — this warns, it does not block. A hard
 * gate would turn a seller's first real sale into a rejection and strand a
 * buyer who has done nothing wrong.
 *
 * Renders NOTHING while status is unknown or already fine. A false alarm here
 * tells a seller their payouts are broken when they aren't, which is worse than
 * silence.
 */
export function SellerPayoutWarning({
  variant,
  className,
}: {
  /** `pre-accept` sits above Accept/Decline; `scheduled` persists after. */
  variant: "pre-accept" | "scheduled";
  className?: string;
}) {
  const { status, loading } = usePayoutStatus();

  if (loading || !status || status.payoutsEnabled) return null;

  const resuming = status.connected && !status.onboardingComplete;

  return (
    <div
      className={`rounded-2xl border border-amber-300 bg-amber-50 p-4 ${className ?? ""}`}
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-amber-900">
            {variant === "pre-accept"
              ? "This buyer can't pay yet"
              : "Finish payout setup so this buyer can pay"}
          </p>
          <p className="mt-1 text-sm text-amber-800">
            {variant === "pre-accept"
              ? "Your payouts aren't set up, so checkout is blocked for them. You can still accept — just finish setup before you meet."
              : "Your meetup is scheduled, but checkout stays blocked for the buyer until your payouts are set up."}
          </p>

          <div className="mt-3">
            <PayoutSetupButton
              status={status}
              label={
                resuming ? "Finish payout setup" : "Set up payouts · ~3 min"
              }
              className="btn-primary min-h-[44px] w-full sm:w-auto"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
