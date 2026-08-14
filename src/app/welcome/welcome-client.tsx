"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Handshake, Loader2, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PayoutSetupButton, usePayoutStatus } from "@/components/payout-setup";

/**
 * The welcome content. Eligibility was already decided server-side in page.tsx,
 * so this component's only job is to explain the product and get them moving.
 *
 * Marking onboarding complete is fire-and-forget on the way out: a failed
 * write means someone sees this screen twice, which is a far better failure
 * than blocking a brand-new user behind a spinner on their first action.
 */

const STEPS = [
  {
    icon: Camera,
    title: "List your gear",
    body: "Snap a few photos and our AI writes the listing and prices it for you.",
  },
  {
    icon: Handshake,
    title: "Meet at a safe zone",
    body: "Agree a time and meet at a verified public exchange spot near you.",
  },
  {
    icon: Wallet,
    title: "Get paid",
    body: "The buyer pays up front. We hold it until you hand the item over.",
  },
];

export function WelcomeClient({
  firstName,
  nextPath,
}: {
  firstName: string | null;
  nextPath: string;
}) {
  const router = useRouter();
  const { status, loading } = usePayoutStatus();
  const [leaving, setLeaving] = useState<null | "sell" | "skip">(null);

  const finish = useCallback(
    async (to: string, which: "sell" | "skip") => {
      setLeaving(which);
      // Awaited so the write lands before we navigate away — a fire-and-forget
      // request can be cancelled by the navigation itself, which would leave
      // onboarding_completed_at null and replay this screen. Errors are
      // swallowed: seeing the welcome twice beats stalling someone on their
      // very first action.
      try {
        await fetch("/api/onboarding/complete", { method: "POST" });
      } catch {
        // Intentionally ignored — see above.
      }
      router.push(to);
      router.refresh();
    },
    [router],
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto w-full max-w-lg px-4 py-8 pb-16">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <p className="font-heading text-2xl font-bold text-navy">
              {firstName ? `Welcome, ${firstName}` : "Welcome to NearGear"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              The place DFW families buy and sell used youth sports gear.
            </p>
          </div>
          <button
            type="button"
            onClick={() => finish(nextPath, "skip")}
            disabled={leaving !== null}
            aria-label="Skip"
            className="-mr-1 rounded-full p-2 text-muted-foreground hover:bg-black/5 hover:text-navy"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <ol className="mb-6 space-y-3">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <li
                key={step.title}
                className="flex items-start gap-3 rounded-2xl border bg-white p-4"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange/10">
                  <Icon className="h-5 w-5 text-orange" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-navy">
                    <span className="text-muted-foreground tabular-nums">
                      {i + 1}.
                    </span>{" "}
                    {step.title}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {step.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        {/* Payouts, offered but never required. Listing stays the easy action —
            the same principle as the accept warning and post-listing prompt. */}
        {!loading && status && !status.payoutsEnabled && (
          <div className="mb-6 rounded-2xl border bg-white p-4">
            <p className="font-semibold text-navy">
              Set up payouts when you&apos;re ready
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              You can list first and do this later — but it has to be done
              before a buyer can pay you.
            </p>
            <div className="mt-3">
              <PayoutSetupButton
                status={status}
                label="Set up payouts"
                className="min-h-[44px] w-full sm:w-auto"
                variant="outline"
              />
            </div>
          </div>
        )}

        <Button
          onClick={() => finish("/sell", "sell")}
          disabled={leaving !== null}
          className="btn-large btn-primary"
        >
          {leaving === "sell" ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Camera className="h-5 w-5" />
          )}
          List your first item
        </Button>

        <button
          type="button"
          onClick={() => finish(nextPath, "skip")}
          disabled={leaving !== null}
          className="mt-2 w-full py-2 text-center text-sm text-muted-foreground hover:text-navy"
        >
          {leaving === "skip" ? "One moment…" : "I'll look around first"}
        </button>
      </main>
    </div>
  );
}
