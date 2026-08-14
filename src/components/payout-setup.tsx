"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";

/**
 * Shared Stripe payout onboarding entry point.
 *
 * Every route into Connect onboarding goes through here — the wallet card, the
 * accept-request warning, and the post-listing prompt — so the explainer is
 * written once and the three surfaces cannot drift apart.
 *
 * The explainer is deliberately NOT a modal: there is no dialog primitive in
 * this project, and an inline panel behaves better on the phones most sellers
 * are using. It expands in place, so the seller never loses their context.
 */

export interface PayoutStatus {
  connected: boolean;
  onboardingComplete: boolean;
  payoutsEnabled: boolean;
  accountId: string | null;
}

/**
 * Current user's Connect status, server-synced with Stripe.
 *
 * Returns null while loading AND on failure — callers treat null as "don't
 * know", which must never render a warning. Telling a seller their payouts are
 * broken because a status fetch failed is worse than staying quiet.
 */
export function usePayoutStatus(): {
  status: PayoutStatus | null;
  loading: boolean;
} {
  const [status, setStatus] = useState<PayoutStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/stripe/connect/status");
        if (res.ok && alive) setStatus((await res.json()) as PayoutStatus);
      } catch {
        // Leave null — "unknown", not "not set up".
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, []);

  return { status, loading };
}

/** Start the hosted flow. Resolves only on failure — success navigates away. */
async function redirectToStripe(): Promise<void> {
  try {
    const res = await fetch("/api/stripe/connect", { method: "POST" });
    const data = (await res.json()) as { url?: string; error?: string };
    if (res.ok && data.url) {
      window.location.href = data.url;
      return;
    }
    toast.error(data.error || "Couldn't start Stripe setup.");
  } catch {
    toast.error("Network error. Please try again.");
  }
}

/**
 * What the seller is walking into. Shown before the redirect so the hosted flow
 * is not the first time they learn an SSN is involved.
 *
 * No "choose Individual" line: stripe-connect.ts sets business_type at account
 * creation, so Stripe pre-fills it and the seller is unlikely to be asked.
 * Instructions for a screen that may not appear cost more trust than they save.
 */
export function PayoutExplainer({
  onContinue,
  redirecting,
}: {
  onContinue: () => void;
  redirecting: boolean;
}) {
  return (
    <div className="mt-3 rounded-xl border border-orange/25 bg-orange/5 p-4">
      <div className="flex items-start gap-2.5">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-orange" />
        <div className="min-w-0">
          <p className="font-semibold text-navy">
            Set up payouts{" "}
            <span className="font-normal text-muted-foreground">
              &middot; about 3 minutes, one time
            </span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Stripe handles the money so NearGear never stores your bank details.
          </p>

          <p className="mt-3 text-sm font-semibold text-navy">
            What you&apos;ll need
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Your legal name, date of birth and home address</li>
            <li>The last 4 digits of your SSN</li>
            <li>A bank account or debit card</li>
            <li>
              If Stripe asks for a website, enter{" "}
              <span className="font-semibold text-navy">near-gear.com</span>
            </li>
          </ul>

          <Button
            onClick={onContinue}
            disabled={redirecting}
            className="btn-primary mt-4 min-h-[44px] w-full"
          >
            {redirecting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Continue to Stripe
          </Button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Stripe brings you back to your NearGear wallet when you&apos;re done.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * The button every surface uses.
 *
 * First-timers see the explainer before the redirect. Anyone who already has a
 * Stripe account is resuming an interrupted setup and goes straight there —
 * re-explaining a flow they have already seen is friction, not help.
 */
export function PayoutSetupButton({
  status,
  label = "Set up payouts",
  className,
  variant = "primary",
}: {
  status: PayoutStatus | null;
  label?: string;
  className?: string;
  variant?: "primary" | "outline";
}) {
  const [expanded, setExpanded] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  const go = useCallback(async () => {
    setRedirecting(true);
    await redirectToStripe();
    setRedirecting(false);
  }, []);

  const onClick = useCallback(() => {
    if (status?.connected) {
      void go();
      return;
    }
    setExpanded(true);
  }, [status?.connected, go]);

  if (expanded) {
    return <PayoutExplainer onContinue={go} redirecting={redirecting} />;
  }

  return (
    <Button
      onClick={onClick}
      disabled={redirecting}
      className={
        className ??
        (variant === "outline"
          ? "min-h-[44px]"
          : "btn-primary min-h-[44px] w-full")
      }
      variant={variant === "outline" ? "outline" : undefined}
    >
      {redirecting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {label}
    </Button>
  );
}
