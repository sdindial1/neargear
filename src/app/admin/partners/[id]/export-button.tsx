"use client";

import { useState } from "react";
import { Download } from "lucide-react";

interface Props {
  partnerId: string;
}

// Date-range CSV export. Hitting the GET route directly lets the browser handle
// the file download via Content-Disposition.
export function ExportButton({ partnerId }: Props) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const download = () => {
    const qs = new URLSearchParams();
    if (start) qs.set("start", start);
    if (end) qs.set("end", end);
    const query = qs.toString();
    window.location.href = `/api/admin/partners/${partnerId}/export${
      query ? `?${query}` : ""
    }`;
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold text-navy transition hover:bg-gray-50"
      >
        <Download className="h-4 w-4" /> Export Report
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border bg-white p-4 shadow-lg">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Export transactions (CSV)
          </p>
          <div className="space-y-2">
            <label className="block text-xs text-muted-foreground">
              Start date
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              End date
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
            Leave both blank to export all time.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              onClick={download}
              className="rounded-md bg-orange px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
            >
              Download
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
