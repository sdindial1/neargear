"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ItemDisputeButton } from "@/components/item-dispute-modal";
import { TransactionCelebration } from "@/components/transaction-celebration";
import { AlertTriangle, CheckCircle2, Clock, Loader2, Sparkles } from "lucide-react";
import toast from "react-hot-toast";

/**
 * Handoff confirmation — payments Phase 3.
 *
 * THIS COMPONENT WRITES NOTHING TO THE DATABASE. It posts to the confirm routes
 * and renders what comes back. That is the entire point of the rewrite: before
 * Phase 3 this file computed the platform fee in the browser and inserted the
 * ledger row itself, which meant a participant could post any fee they liked
 * and meant two independent writers (this component and the cron) could both
 * complete the same meetup. Both are gone.
 *
 * The only paths to 'completed' now are the confirm routes -> releaseOrder(),
 * with the mig-015 trigger refusing any completion without a captured order.
 *
 * Ladder surfaced here:
 *   rung 1  buyer taps "I Received the Item"  -> POST confirm-receipt -> released now
 *   rung 2  seller taps "I Handed Off"        -> POST confirm-handoff -> buyer has 24h
 *   rung 3  neither acts                      -> cron backstop (no UI)
 *   rung 4  dispute                           -> frozen, shown as such
 */

interface Props {
  meetupId: string;
  currentUserId: string;
  buyerId: string;
  sellerId: string;

  /** Order state. orderId is null when the buyer hasn't paid yet. */
  orderId: string | null;
  orderStatus: string | null;
  buyerConfirmedAt: string | null;
  sellerConfirmedAt: string | null;
  disputedAt: string | null;

  /** Display only — no money is computed in this component. */
  itemPriceCents: number;
  retailPriceCents: number | null;
}

type Phase =
  | "no_order" // nothing captured yet — no confirmation is offered
  | "ready" // paid and held, waiting on me
  | "awaiting_buyer" // seller confirmed, buyer's 24h window running
  | "submitting"
  | "processing" // release is retrying in the background
  | "celebrating"
  | "complete"
  | "disputed";

const RELEASED_STATUSES = new Set(["releasing", "released"]);

export function CompleteTransactionSection({
  meetupId,
  currentUserId,
  buyerId,
  sellerId,
  orderId,
  orderStatus,
  buyerConfirmedAt,
  sellerConfirmedAt,
  disputedAt,
  itemPriceCents,
  retailPriceCents,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const isBuyer = currentUserId === buyerId;
  const isSeller = currentUserId === sellerId;

  const initialPhase: Phase = (() => {
    if (disputedAt) return "disputed";
    if (orderStatus && RELEASED_STATUSES.has(orderStatus)) return "complete";
    if (!orderId || orderStatus !== "paid_held") return "no_order";
    if (sellerConfirmedAt && !buyerConfirmedAt) return "awaiting_buyer";
    return "ready";
  })();

  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  // Watch the ORDER, not the meetup: release state is the source of truth now.
  // Lets the other party's screen flip to complete when a release lands —
  // including a release fired by the cron with nobody looking.
  useEffect(() => {
    if (!orderId) return;
    if (phase === "complete" || phase === "celebrating") return;

    const channel = supabase
      .channel(`order-release-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          const next = payload.new as {
            status?: string;
            disputed_at?: string | null;
            seller_confirmed_at?: string | null;
          };
          if (next.disputed_at) {
            setPhase("disputed");
            return;
          }
          if (next.status && RELEASED_STATUSES.has(next.status)) {
            setPhase("celebrating");
            return;
          }
          if (next.seller_confirmed_at && isBuyer) setPhase("awaiting_buyer");
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, phase, supabase, isBuyer]);

  if (!isBuyer && !isSeller) return null;

  /** Post to a confirm route and map the response onto a phase. */
  const submit = async (path: "confirm-receipt" | "confirm-handoff") => {
    if (!orderId) return;
    setConfirming(false);
    setSubmitting();
    setError("");

    try {
      const res = await fetch(`/api/orders/${orderId}/${path}`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        outcome?: string;
        message?: string;
        error?: string;
      };

      if (!res.ok) {
        // Guard rejections: disputed, already released, not paid, wrong party.
        if (body.error === "disputed") {
          setPhase("disputed");
          return;
        }
        if (body.error === "already_released") {
          setPhase("complete");
          router.refresh();
          return;
        }
        setError(body.message || "Something went wrong. Please try again.");
        setPhase(initialPhase);
        return;
      }

      switch (body.outcome) {
        case "released":
          setPhase("celebrating");
          break;
        case "skipped":
          setPhase("complete");
          break;
        case "pending_retry":
          // Confirmation recorded; the payout is retrying. Say so honestly.
          setPhase("processing");
          toast.success(body.message ?? "Confirmation recorded.");
          break;
        case "awaiting_buyer":
        case "already_confirmed":
          setPhase("awaiting_buyer");
          toast.success(body.message ?? "We've let the buyer know.");
          break;
        default:
          setPhase("complete");
      }
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setPhase(initialPhase);
    }
  };

  function setSubmitting() {
    setPhase("submitting");
  }

  // ---- Render ------------------------------------------------------------

  if (phase === "no_order") {
    // Payment hasn't been captured, so no confirmation is offered at all. This
    // mirrors the paid_held gate in the confirm routes and the mig-015 trigger.
    if (isSeller) {
      return (
        <div className="bg-white rounded-2xl border p-4 flex items-center gap-3">
          <Clock className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          <p className="text-sm text-muted-foreground">
            Once the buyer pays, you&apos;ll be able to confirm the handoff here.
          </p>
        </div>
      );
    }
    // Buyer: MeetupPaySection above already owns the payment CTA.
    return null;
  }

  if (phase === "disputed") {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0" />
        <div>
          <p className="font-heading font-semibold text-red-900">
            Payment on hold
          </p>
          <p className="text-sm text-red-800">
            There&apos;s an open issue on this order. The payment stays held
            while our team reviews it — nothing is released to either side until
            it&apos;s resolved.
          </p>
        </div>
      </div>
    );
  }

  if (phase === "complete") {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
        <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
        <div>
          <p className="font-heading font-semibold text-green-900">
            Transaction complete
          </p>
          <p className="text-sm text-green-800">
            {isSeller
              ? "Your payment has been released."
              : "Thanks for using NearGear."}
          </p>
        </div>
      </div>
    );
  }

  if (phase === "celebrating") {
    return (
      <TransactionCelebration
        role={isBuyer ? "buyer" : "seller"}
        grossDollars={itemPriceCents / 100}
        retailDollars={retailPriceCents ? retailPriceCents / 100 : null}
        meetupId={meetupId}
      />
    );
  }

  if (phase === "processing") {
    return (
      <div className="bg-navy/5 border rounded-2xl p-6 text-center">
        <Loader2 className="w-6 h-6 animate-spin text-orange mx-auto mb-2" />
        <p className="font-heading font-semibold text-navy">
          Payment processing…
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          We&apos;ve recorded the confirmation. The seller&apos;s payment will
          complete shortly.
        </p>
      </div>
    );
  }

  if (phase === "awaiting_buyer") {
    // Seller side: clock is running, nothing to do.
    if (isSeller) {
      return (
        <div className="bg-orange/5 border border-orange/20 rounded-2xl p-4 flex items-center gap-3">
          <CheckCircle2 className="w-6 h-6 text-orange flex-shrink-0" />
          <div className="flex-1">
            <p className="font-heading font-semibold text-navy">
              You confirmed the handoff
            </p>
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-orange animate-pulse" />
              Waiting on the buyer. If they don&apos;t respond within 24 hours,
              your payment is released automatically.
            </p>
          </div>
        </div>
      );
    }

    // Buyer side: the 24h window. Both actions must be visible here — this is
    // the moment where doing nothing releases their money.
    return (
      <div className="bg-white rounded-2xl border-2 border-orange/40 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 text-orange flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-heading text-lg font-bold text-navy">
              The seller marked this handed off
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Confirm you got the item, or report a problem, within 24 hours.
              After that your payment is released to the seller automatically.
            </p>
          </div>
        </div>

        <Button
          type="button"
          onClick={() => setConfirming(true)}
          className="btn-large btn-primary w-full"
        >
          <Sparkles className="w-5 h-5" />
          I Received the Item
        </Button>

        <ItemDisputeButton
          meetupId={meetupId}
          trigger={
            <Button variant="outline" className="btn-large w-full">
              <AlertTriangle className="w-4 h-4" />
              Something&apos;s wrong — report a problem
            </Button>
          }
        />

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</p>
        )}
        {confirming && (
          <ConfirmDialog
            isBuyer
            onCancel={() => setConfirming(false)}
            onConfirm={() => submit("confirm-receipt")}
          />
        )}
      </div>
    );
  }

  // phase === "ready" | "submitting"
  const myLabel = isBuyer ? "I Received the Item" : "I Handed Off the Item";
  const subtitle = isBuyer
    ? "Tap below once you've received the item and you're happy with it. This releases payment to the seller."
    : "Tap below once you've handed off the item. The buyer then has 24 hours to confirm before payment is released automatically.";

  return (
    <div className="bg-white rounded-2xl border p-4 space-y-3">
      <div>
        <p className="font-heading text-lg font-bold text-navy">
          Ready to complete?
        </p>
        <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
      </div>

      <Button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={phase === "submitting"}
        className="btn-large btn-primary"
      >
        {phase === "submitting" ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Sparkles className="w-5 h-5" />
        )}
        {myLabel}
      </Button>

      {isBuyer && (
        <ItemDisputeButton
          meetupId={meetupId}
          trigger={
            <Button variant="outline" className="btn-large w-full">
              <AlertTriangle className="w-4 h-4" />
              Report a problem instead
            </Button>
          }
        />
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</p>
      )}

      {confirming && (
        <ConfirmDialog
          isBuyer={isBuyer}
          onCancel={() => setConfirming(false)}
          onConfirm={() =>
            submit(isBuyer ? "confirm-receipt" : "confirm-handoff")
          }
        />
      )}
    </div>
  );
}

function ConfirmDialog({
  isBuyer,
  onCancel,
  onConfirm,
}: {
  isBuyer: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] bg-black/40 flex items-end md:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
        <h3 className="font-heading text-xl font-bold text-navy">
          {isBuyer ? "Confirm you received it?" : "Confirm the handoff?"}
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {isBuyer
            ? "This releases your payment to the seller and closes the sale. Only do this once you have the item and you're happy with it."
            : "We'll let the buyer know and give them 24 hours to confirm. If they don't respond, your payment is released automatically."}
        </p>
        <div className="flex gap-2 pt-1">
          <Button variant="outline" onClick={onCancel} className="btn-large flex-1">
            Not Yet
          </Button>
          <Button onClick={onConfirm} className="btn-large flex-1 btn-primary">
            {isBuyer ? "Yes, Release Payment" : "Yes, Confirm"}
          </Button>
        </div>
      </div>
    </div>
  );
}
