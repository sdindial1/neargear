"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { AlertTriangle, Loader2, X } from "lucide-react";

const REASONS = [
  "Item condition is much worse than listed",
  "This is the wrong item",
  "Item is damaged",
  "Item appears fake or counterfeit",
  "Other",
];

interface Props {
  meetupId: string;
  trigger: React.ReactNode;
}

export function ItemDisputeButton({ meetupId, trigger }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const close = () => {
    if (submitting) return;
    setOpen(false);
    setReason("");
    setNotes("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) {
      toast.error("Pick a reason first");
      return;
    }
    setSubmitting(true);
    const res = await fetch(`/api/meetups/${meetupId}/item-dispute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, notes: notes.trim() || undefined }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error || `Failed (${res.status})`);
      return;
    }
    toast.success(
      "Item issue reported. Your deposit will be refunded.",
    );
    setOpen(false);
    router.push("/profile/meetups");
    router.refresh();
  };

  return (
    <>
      <span onClick={() => setOpen(true)} className="inline-block">
        {trigger}
      </span>

      {open && (
        <>
          <div
            className="fixed inset-0 z-[80] bg-black/50"
            onClick={close}
            aria-hidden
          />
          <div className="fixed inset-x-0 bottom-0 z-[81] sm:inset-0 sm:flex sm:items-center sm:justify-center safe-bottom">
            <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md sm:m-4 p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  </div>
                  <h2 className="font-heading text-lg font-bold text-navy">
                    Report an item issue
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  className="p-2 -mr-2 rounded-full hover:bg-gray-100"
                >
                  <X className="w-5 h-5 text-navy" />
                </button>
              </div>

              <p className="text-xs text-muted-foreground mb-4">
                Only use this if the item is significantly different from
                the listing.
              </p>

              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-navy">
                    Reason
                  </label>
                  <select
                    required
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full min-h-[48px] px-3 rounded-xl border border-gray-300 bg-white text-base"
                  >
                    <option value="" disabled>
                      Pick a reason…
                    </option>
                    {REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="dispute-notes"
                    className="text-sm font-semibold text-navy"
                  >
                    Notes (optional)
                  </label>
                  <textarea
                    id="dispute-notes"
                    rows={3}
                    maxLength={200}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Anything else we should know?"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm resize-none"
                  />
                  <p className="text-[11px] text-muted-foreground text-right">
                    {notes.length}/200
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={submitting || !reason}
                  className="w-full min-h-[48px] rounded-xl bg-red-600 hover:bg-red-700 text-white font-heading font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {submitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : null}
                  Submit Report
                </button>
                <button
                  type="button"
                  onClick={close}
                  disabled={submitting}
                  className="w-full text-sm text-muted-foreground"
                >
                  Cancel
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </>
  );
}
