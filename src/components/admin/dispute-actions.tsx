"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { DisputeResolution } from "@/types/database";

/**
 * The two resolution buttons for one queued case.
 *
 * Both are irreversible money movements, so neither fires on a single click —
 * each opens a confirmation naming the exact amount and who receives it. The
 * server re-checks admin auth regardless; hiding a button is not a control.
 */
export function DisputeActions({
  orderId,
  refundAmountCents,
  payoutAmountCents,
  buyerName,
  sellerName,
}: {
  orderId: string;
  refundAmountCents: number;
  payoutAmountCents: number;
  buyerName: string;
  sellerName: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<DisputeResolution | null>(null);
  const [confirming, setConfirming] = useState<DisputeResolution | null>(null);

  const money = (c: number) => `$${(c / 100).toFixed(2)}`;

  const resolve = async (resolution: DisputeResolution) => {
    setConfirming(null);
    setPending(resolution);
    try {
      const res = await fetch(`/api/admin/disputes/${orderId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };

      if (!res.ok) {
        // Long-lived so a money failure can't scroll past unread.
        toast.error(body.message || body.error || "Resolution failed", {
          duration: 10000,
        });
        return;
      }
      toast.success(body.message ?? "Resolved", { duration: 6000 });
      router.refresh();
    } catch {
      toast.error("Network error — the case was not resolved.", {
        duration: 10000,
      });
    } finally {
      setPending(null);
    }
  };

  const isRefund = confirming === "refund_buyer";

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => setConfirming("refund_buyer")}
          disabled={pending !== null}
          className="bg-navy text-white hover:bg-navy/90"
        >
          {pending === "refund_buyer" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          Refund buyer {money(refundAmountCents)}
        </Button>
        <Button
          variant="outline"
          onClick={() => setConfirming("release_seller")}
          disabled={pending !== null}
        >
          {pending === "release_seller" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          Release to seller {money(payoutAmountCents)}
        </Button>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-4 md:items-center">
          <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-orange" />
              <div>
                <h3 className="font-heading text-xl font-bold text-navy">
                  {isRefund ? "Refund the buyer?" : "Release to the seller?"}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {isRefund ? (
                    <>
                      This sends <strong>{money(refundAmountCents)}</strong> back
                      to <strong>{buyerName}</strong> — the item price and the
                      Buyer Protection fee. The seller receives nothing.
                    </>
                  ) : (
                    <>
                      This pays <strong>{money(payoutAmountCents)}</strong> to{" "}
                      <strong>{sellerName}</strong>. The buyer is not refunded.
                    </>
                  )}
                </p>
                <p className="mt-2 text-sm font-semibold text-navy">
                  Money moves immediately and this can&apos;t be undone here.
                </p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setConfirming(null)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 btn-primary"
                onClick={() => resolve(confirming)}
              >
                {isRefund ? "Yes, refund" : "Yes, release"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
