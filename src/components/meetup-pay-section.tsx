"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { computeOrderBreakdown } from "@/lib/fees";
import { Loader2, ShieldCheck, CheckCircle2, Clock } from "lucide-react";
import toast from "react-hot-toast";

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Buyer-only payment section on an ACCEPTED (scheduled) meetup — payments
 * Phase 2. Shows the full-payment breakdown (item + Buyer Protection fee) and
 * starts Stripe Checkout. Once captured, shows the held state. Transfers,
 * confirmation/release, and refunds are later phases.
 *
 * Mount this only for the buyer, when meetup.status === 'scheduled'.
 */
export function MeetupPaySection({
  meetupId,
  offeredPriceCents,
  sellerIsFoundingMember,
  sellerPayoutsEnabled,
  initialPaid,
}: {
  meetupId: string;
  offeredPriceCents: number;
  sellerIsFoundingMember: boolean;
  sellerPayoutsEnabled: boolean;
  initialPaid: boolean;
}) {
  const [paid, setPaid] = useState(initialPaid);
  const [starting, setStarting] = useState(false);

  const breakdown = computeOrderBreakdown(
    offeredPriceCents,
    sellerIsFoundingMember,
  );

  // On return from Stripe (?paid=1), the webhook may lag a beat. Poll the order
  // a few times so the UI flips to "held" without a manual refresh.
  useEffect(() => {
    if (paid) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("paid") !== "1") return;

    const supabase = createClient();
    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      attempts += 1;
      const { data } = await supabase
        .from("orders")
        .select("status")
        .eq("meetup_id", meetupId)
        .eq("status", "paid_held")
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setPaid(true);
        toast.success("Payment received — held securely until handoff.");
        return;
      }
      if (attempts < 5) setTimeout(poll, 1500);
    };
    poll();

    return () => {
      cancelled = true;
    };
  }, [meetupId, paid]);

  const startCheckout = async () => {
    setStarting(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetupId }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url as string;
        return;
      }
      toast.error(data.message || data.error || "Couldn't start checkout.");
    } catch {
      toast.error("Network error. Please try again.");
    }
    setStarting(false);
  };

  if (paid) {
    return (
      <div className="bg-white rounded-2xl border p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-navy">
              Paid — held securely by NearGear
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              We&apos;re holding {money(breakdown.buyerTotalCents)} until you
              confirm the handoff. Meet up, check the item, and confirm to
              release payment to the seller.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!sellerPayoutsEnabled) {
    return (
      <div className="bg-white rounded-2xl border p-4">
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 text-orange mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-navy">Checkout not ready yet</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              The seller is still finishing their payout setup. You&apos;ll be
              able to pay here as soon as they&apos;re done.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border p-4">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="w-5 h-5 text-orange" />
        <p className="font-semibold text-navy">Pay to lock in your meetup</p>
      </div>

      <dl className="space-y-1.5 text-sm mb-3">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Item price</dt>
          <dd className="font-semibold text-navy tabular-nums">
            {money(breakdown.itemPriceCents)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Buyer Protection fee</dt>
          <dd className="font-semibold text-navy tabular-nums">
            {money(breakdown.buyerFeeCents)}
          </dd>
        </div>
        <div className="flex justify-between border-t pt-1.5">
          <dt className="font-semibold text-navy">Total</dt>
          <dd className="font-bold text-orange tabular-nums">
            {money(breakdown.buyerTotalCents)}
          </dd>
        </div>
      </dl>

      <Button
        onClick={startCheckout}
        disabled={starting}
        className="btn-large btn-primary w-full"
      >
        {starting ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <>Pay {money(breakdown.buyerTotalCents)}</>
        )}
      </Button>
      <p className="text-[11px] text-muted-foreground mt-2 text-center leading-relaxed">
        Held securely by NearGear and released to the seller after you confirm
        the handoff.
      </p>
    </div>
  );
}
