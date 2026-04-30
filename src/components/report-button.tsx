"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Flag, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Props {
  target: { type: "listing"; id: string } | { type: "user"; id: string };
}

const LISTING_REASONS = [
  "Item not as described",
  "Fake or misleading listing",
  "Wrong category",
  "Spam",
  "Other",
];

const USER_REASONS = [
  "Threatening or abusive behavior",
  "Fake account",
  "Scam or fraud",
  "No-show",
  "Other",
];

export function ReportButton({ target }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const supabase = createClient();

  const reasons = target.type === "listing" ? LISTING_REASONS : USER_REASONS;
  const targetLabel = target.type === "listing" ? "listing" : "user";

  const reset = () => {
    setReason("");
    setDetails("");
    setSubmitting(false);
  };

  const close = () => {
    setOpen(false);
    reset();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) {
      toast.error("Pick a reason first");
      return;
    }
    setSubmitting(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Sign in to file a report");
      setSubmitting(false);
      return;
    }

    const payload: Record<string, unknown> = {
      reporter_id: user.id,
      reason,
      details: details.trim() || null,
    };
    if (target.type === "listing") payload.reported_listing_id = target.id;
    else payload.reported_user_id = target.id;

    const { error } = await supabase.from("reports").insert(payload);

    if (error) {
      toast.error(error.message);
      setSubmitting(false);
      return;
    }
    toast.success(
      "Thanks for reporting. We'll review this within 24 hours.",
    );
    close();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-muted-foreground hover:text-red-600 inline-flex items-center gap-1"
      >
        <Flag className="w-3 h-3" /> Report
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-[80] bg-black/50"
            onClick={close}
            aria-hidden="true"
          />
          <div className="fixed inset-x-0 bottom-0 sm:inset-0 z-[81] sm:flex sm:items-center sm:justify-center safe-bottom">
            <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md sm:m-4 p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-heading text-lg font-bold text-navy">
                  Report this {targetLabel}
                </h2>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  className="p-2 -mr-2 rounded-full hover:bg-gray-100"
                >
                  <X className="w-5 h-5 text-navy" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
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
                    {reasons.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="report-details"
                    className="text-sm font-semibold text-navy"
                  >
                    Additional details (optional)
                  </label>
                  <textarea
                    id="report-details"
                    rows={3}
                    maxLength={500}
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    placeholder="Anything else we should know?"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting || !reason}
                  className="w-full min-h-[48px] rounded-xl bg-orange hover:bg-orange-light text-white font-heading font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {submitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Flag className="w-5 h-5" />
                  )}
                  Submit Report
                </button>
                <button
                  type="button"
                  onClick={close}
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
