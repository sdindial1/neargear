"use client";

import { useMemo, useState } from "react";
import { formatCents, PAYOUT_STATUS_BADGE } from "@/lib/partner";
import type { PartnerPayoutStatus } from "@/types/database";

export interface PartnerTxRow {
  id: string;
  created_at: string;
  seller_name: string;
  gross_sale_amount: number;
  platform_fee_amount: number;
  attributed_amount: number;
  payout_status: PartnerPayoutStatus;
}

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
  { value: "reversed", label: "Reversed" },
];

export function TransactionsPanel({ rows }: { rows: PartnerTxRow[] }) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const day = r.created_at.slice(0, 10);
      if (start && day < start) return false;
      if (end && day > end) return false;
      if (status !== "all" && r.payout_status !== status) return false;
      return true;
    });
  }, [rows, start, end, status]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">
          From
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="ml-2 h-8 rounded-md border border-input bg-background px-2 text-sm"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          To
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="ml-2 h-8 rounded-md border border-input bg-background px-2 text-sm"
          />
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-gray-50 px-4 py-8 text-center text-sm text-muted-foreground">
          No transactions{rows.length > 0 ? " match these filters" : " yet"}.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Seller</th>
                <th className="px-3 py-2 text-right">Gross</th>
                <th className="px-3 py-2 text-right">Platform Fee</th>
                <th className="px-3 py-2 text-right">Attributed</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((r) => {
                const badge = PAYOUT_STATUS_BADGE[r.payout_status];
                return (
                  <tr key={r.id}>
                    <td className="px-3 py-2">{r.created_at.slice(0, 10)}</td>
                    <td className="px-3 py-2">{r.seller_name || "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {formatCents(r.gross_sale_amount)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatCents(r.platform_fee_amount)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      {formatCents(r.attributed_amount)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
