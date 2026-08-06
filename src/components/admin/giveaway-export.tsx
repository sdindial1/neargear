"use client";

import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

/**
 * CSV export for the drawing audit.
 *
 * Builds the file in the browser from data already rendered on the page, so
 * there is no second API route holding entrant PII. Rules §7 requires the
 * drawing to be auditable; this is the artefact you keep.
 */
export function GiveawayExport({
  filename,
  headers,
  rows,
  label,
}: {
  filename: string;
  headers: string[];
  rows: (string | number | null)[][];
  label: string;
}) {
  const download = () => {
    const escape = (v: string | number | null) => {
      const s = v === null || v === undefined ? "" : String(v);
      // Quote if the value contains a comma, quote or newline; double inner quotes.
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers, ...rows]
      .map((r) => r.map(escape).join(","))
      .join("\n");

    const blob = new Blob([`﻿${csv}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button variant="outline" onClick={download} disabled={rows.length === 0}>
      <Download className="h-4 w-4" />
      {label} ({rows.length})
    </Button>
  );
}
