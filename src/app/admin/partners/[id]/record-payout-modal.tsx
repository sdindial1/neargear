"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2, Plus } from "lucide-react";
import { formatCents } from "@/lib/partner";

interface PendingTx {
  created_at: string;
  attributed_amount: number;
}

interface Props {
  partnerId: string;
  pendingTransactions: PendingTx[];
}

const METHODS = ["check", "ach", "wire", "other"];

export function RecordPayoutModal({ partnerId, pendingTransactions }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [amount, setAmount] = useState(""); // dollars
  const [method, setMethod] = useState("check");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sum of attributed amounts whose date falls in the chosen period. This is a
  // preview only; the API recomputes authoritatively from pending rows on save.
  const pendingInPeriod = useMemo(() => {
    if (!start || !end) return 0;
    return pendingTransactions.reduce((sum, t) => {
      const day = t.created_at.slice(0, 10);
      return day >= start && day <= end ? sum + (t.attributed_amount ?? 0) : sum;
    }, 0);
  }, [start, end, pendingTransactions]);

  const reset = () => {
    setStart("");
    setEnd("");
    setAmount("");
    setMethod("check");
    setReference("");
    setNotes("");
    setAmountTouched(false);
  };

  const submit = async () => {
    if (!start || !end) {
      toast.error("Pick a period start and end");
      return;
    }
    if (start > end) {
      toast.error("Start must be on or before end");
      return;
    }
    const dollars = amountTouched ? Number(amount) : pendingInPeriod / 100;
    if (Number.isNaN(dollars) || dollars < 0) {
      toast.error("Enter a valid payout amount");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/partners/${partnerId}/payouts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period_start: start,
          period_end: end,
          payout_amount: Math.round(dollars * 100),
          payout_method: method,
          payout_reference: reference,
          notes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "Could not record payout");
        setSaving(false);
        return;
      }
      toast.success(
        `Payout recorded — ${data.transactions_marked} transaction(s) marked paid`,
      );
      setOpen(false);
      reset();
      router.refresh();
    } catch {
      toast.error("Network error");
    }
    setSaving(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
      >
        <Plus className="h-4 w-4" /> Record Payout
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-1 font-heading text-lg font-bold text-navy">
              Record Payout
            </h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Marks all pending transactions in the period as paid.
            </p>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-muted-foreground">
                  Period start
                  <input
                    type="date"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  />
                </label>
                <label className="block text-xs text-muted-foreground">
                  Period end
                  <input
                    type="date"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  />
                </label>
              </div>

              {start && end && (
                <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
                  Pending attributed in period:{" "}
                  <span className="font-semibold text-navy">
                    {formatCents(pendingInPeriod)}
                  </span>
                </div>
              )}

              <label className="block text-xs text-muted-foreground">
                Amount paid (USD)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={amountTouched ? amount : (pendingInPeriod / 100).toFixed(2)}
                  onChange={(e) => {
                    setAmountTouched(true);
                    setAmount(e.target.value);
                  }}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                />
              </label>

              <label className="block text-xs text-muted-foreground">
                Method
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm capitalize"
                >
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs text-muted-foreground">
                Reference (check #, transaction ID)
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  placeholder="Check #1042"
                />
              </label>

              <label className="block text-xs text-muted-foreground">
                Notes
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
                disabled={saving}
                className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-md bg-orange px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Record Payout
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
