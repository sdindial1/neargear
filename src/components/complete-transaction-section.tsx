"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { calculatePlatformFee } from "@/lib/fees";
import { fireNotification } from "@/lib/notifications/trigger";
import { TransactionCelebration } from "@/components/transaction-celebration";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";

interface Props {
  meetupId: string;
  buyerId: string;
  sellerId: string;
  listingId: string;
  currentUserId: string;
  initialStatus: string;
  buyerCompletedAt: string | null;
  sellerCompletedAt: string | null;
  offeredPriceCents: number;
  retailPriceCents: number | null;
  sellerIsFoundingMember?: boolean;
}

type Phase =
  | "ready"
  | "confirming"
  | "submitting"
  | "waiting"
  | "processing"
  | "celebrating"
  | "complete";

export function CompleteTransactionSection({
  meetupId,
  buyerId,
  sellerId,
  listingId,
  currentUserId,
  initialStatus,
  buyerCompletedAt,
  sellerCompletedAt,
  offeredPriceCents,
  retailPriceCents,
  sellerIsFoundingMember = false,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const isBuyer = currentUserId === buyerId;
  const isSeller = currentUserId === sellerId;

  const myCompletedAt = isBuyer ? buyerCompletedAt : sellerCompletedAt;
  const otherCompletedAt = isBuyer ? sellerCompletedAt : buyerCompletedAt;

  const initialPhase: Phase =
    initialStatus === "completed" || initialStatus === "payment_processing"
      ? "complete"
      : myCompletedAt
        ? "waiting"
        : "ready";

  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [error, setError] = useState("");

  // While the first confirmer is in "waiting", subscribe to UPDATE events
  // on this meetup. When the second person finishes the flow and the row
  // flips to "completed", flip our phase to "celebrating" so the first
  // confirmer sees the confetti too — not just the second person.
  useEffect(() => {
    if (phase !== "waiting") return;
    const channel = supabase
      .channel(`meetup-complete-${meetupId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "meetups",
          filter: `id=eq.${meetupId}`,
        },
        (payload) => {
          const next = payload.new as { status?: string };
          if (next.status === "completed") {
            setPhase("celebrating");
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [phase, supabase, meetupId]);

  if (!isBuyer && !isSeller) return null;

  const handleConfirm = async () => {
    setPhase("submitting");
    setError("");

    const nowIso = new Date().toISOString();
    const otherAlreadyConfirmed = !!otherCompletedAt;

    const update: Record<string, unknown> = isBuyer
      ? { buyer_completed_at: nowIso }
      : { seller_completed_at: nowIso };
    update.status = otherAlreadyConfirmed
      ? "payment_processing"
      : isBuyer
        ? "buyer_confirmed"
        : "seller_confirmed";
    if (otherAlreadyConfirmed) update.completed_at = nowIso;

    const { error: updErr } = await supabase
      .from("meetups")
      .update(update)
      .eq("id", meetupId);

    if (updErr) {
      setError(updErr.message);
      setPhase("ready");
      return;
    }

    if (!otherAlreadyConfirmed) {
      setPhase("waiting");
      return;
    }

    setPhase("processing");
    await new Promise((r) => setTimeout(r, 2000));

    const fee = calculatePlatformFee(offeredPriceCents, sellerIsFoundingMember);

    await supabase
      .from("meetups")
      .update({ status: "completed" })
      .eq("id", meetupId);

    await supabase
      .from("listings")
      .update({ status: "sold" })
      .eq("id", listingId);

    const { data: tx } = await supabase
      .from("transactions")
      .insert({
        meetup_id: meetupId,
        listing_id: listingId,
        buyer_id: buyerId,
        seller_id: sellerId,
        gross_amount: offeredPriceCents,
        platform_fee: fee,
        net_amount: offeredPriceCents - fee,
        retail_price: retailPriceCents,
      })
      .select("id")
      .single();

    if (tx?.id) {
      void fireNotification({
        event: "transaction_complete",
        transactionId: tx.id,
      });
    }

    setPhase("celebrating");
  };

  const buyerLabel = "I Received the Item";
  const sellerLabel = "I Handed Off the Item";
  const myLabel = isBuyer ? buyerLabel : sellerLabel;
  const myWaitingTitle = isBuyer
    ? "You confirmed receipt"
    : "You confirmed handoff";
  const otherWaitingMsg = isBuyer
    ? "Waiting for seller to confirm…"
    : "Waiting for buyer to confirm…";
  const headerTitle = "Ready to complete?";
  const subtitle = isBuyer
    ? "Tap below once you've received the item and you're happy with it."
    : "Tap below once you've handed off the item and received payment.";

  if (phase === "complete") {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
        <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
        <div>
          <p className="font-heading font-semibold text-green-900">
            Transaction completed
          </p>
          <p className="text-sm text-green-800">
            Thanks for using NearGear.
          </p>
        </div>
      </div>
    );
  }

  if (phase === "waiting") {
    return (
      <div className="bg-orange/5 border border-orange/20 rounded-2xl p-4 flex items-center gap-3">
        <CheckCircle2 className="w-6 h-6 text-orange flex-shrink-0" />
        <div className="flex-1">
          <p className="font-heading font-semibold text-navy">
            {myWaitingTitle}
          </p>
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-orange animate-pulse" />
            {otherWaitingMsg}
          </p>
        </div>
      </div>
    );
  }

  if (phase === "processing") {
    return (
      <div className="bg-navy/5 border rounded-2xl p-6 text-center">
        <Loader2 className="w-6 h-6 animate-spin text-orange mx-auto mb-2" />
        <p className="font-heading font-semibold text-navy">
          Processing payment…
        </p>
      </div>
    );
  }

  if (phase === "celebrating") {
    return (
      <TransactionCelebration
        role={isBuyer ? "buyer" : "seller"}
        grossDollars={offeredPriceCents / 100}
        retailDollars={retailPriceCents ? retailPriceCents / 100 : null}
        meetupId={meetupId}
      />
    );
  }

  return (
    <div className="bg-white rounded-2xl border p-4 space-y-3">
      <div>
        <p className="font-heading text-lg font-bold text-navy">
          {headerTitle}
        </p>
        <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
      </div>

      <Button
        type="button"
        onClick={() => setPhase("confirming")}
        disabled={phase === "submitting"}
        className="btn-large btn-primary"
      >
        <Sparkles className="w-5 h-5" />
        {myLabel}
      </Button>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">
          {error}
        </p>
      )}

      {phase === "confirming" && (
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-heading text-xl font-bold text-navy">
              Confirm completion?
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {isBuyer
                ? "By confirming you're happy with the item as described. This completes the transaction."
                : "Confirming means the item has been handed off and you're ready to receive payment."}
            </p>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => setPhase("ready")}
                className="btn-large flex-1"
              >
                Not Yet
              </Button>
              <Button
                onClick={handleConfirm}
                className="btn-large flex-1 btn-primary"
              >
                Yes, Complete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
