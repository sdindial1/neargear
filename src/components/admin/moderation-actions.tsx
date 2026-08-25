"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

/**
 * Approve / reject controls for one listing in /admin/moderation.
 *
 * `mode` changes what the buttons mean:
 *   held  — the listing is invisible; approving publishes it.
 *   sweep — the listing is ALREADY LIVE (it published fail-open when the
 *           classifier was down). "Approve" here just clears the flag; the
 *           destructive option is the one that changes anything.
 * Labelling both the same way would invite clearing a live listing under the
 * impression it was still held.
 */
export function ModerationActions({
  listingId,
  mode,
}: {
  listingId: string;
  mode: "held" | "sweep";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const send = async (action: "approve" | "reject") => {
    setBusy(action);
    setError("");
    try {
      const res = await fetch(`/api/admin/moderation/${listingId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reason.trim() || undefined }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload.error || "Something went wrong");
        setBusy(null);
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server");
      setBusy(null);
    }
  };

  if (rejecting) {
    return (
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-navy">
          Why? This sentence is emailed to the seller.
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="This looks like a phone rather than sports gear."
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => send("reject")}
            disabled={busy !== null || reason.trim().length < 5}
            className="min-h-[40px] bg-red-600 text-white hover:bg-red-700"
          >
            {busy === "reject" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Rejecting…
              </>
            ) : mode === "sweep" ? (
              "Take down & email seller"
            ) : (
              "Reject & email seller"
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setRejecting(false);
              setReason("");
            }}
            disabled={busy !== null}
            className="min-h-[40px]"
          >
            Cancel
          </Button>
        </div>
        {error && <p className="text-xs text-red-700">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => send("approve")}
          disabled={busy !== null}
          className="btn-primary min-h-[40px]"
        >
          {busy === "approve" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Working…
            </>
          ) : mode === "sweep" ? (
            "Looks fine — clear flag"
          ) : (
            "Approve & publish"
          )}
        </Button>
        <Button
          variant="outline"
          onClick={() => setRejecting(true)}
          disabled={busy !== null}
          className="min-h-[40px] border-red-200 text-red-700 hover:bg-red-50"
        >
          {mode === "sweep" ? "Take down" : "Reject"}
        </Button>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
