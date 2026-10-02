"use client";

import { useEffect, useState } from "react";
import { PROMOTION_END_ISO, PROMOTION_START_ISO } from "@/lib/giveaway";

/**
 * Is the $500 bat drawing open, from the browser?
 *
 * The date half of Rules §3 is decided locally and immediately. The 500-listing
 * half needs a count, so it asks /api/giveaway/status (CDN-cached, five
 * minutes). One request per page load however many components ask: the
 * promise is shared at module level.
 *
 *   null  — not known: still loading, or the count could not be read
 *   true  — open
 *   false — closed (past the date, or 500 active listings reached)
 *
 * Callers that ADVERTISE the drawing must treat null as closed. A caller that
 * would otherwise tell someone "the drawing has closed" must treat null as open,
 * because that sentence has to be true. The entry route enforces the rule
 * server-side regardless; this only decides what is shown.
 */
let pending: Promise<boolean | null> | null = null;

function datesOpen(now = Date.now()): boolean {
  return now >= Date.parse(PROMOTION_START_ISO) && now <= Date.parse(PROMOTION_END_ISO);
}

function fetchOpen(): Promise<boolean | null> {
  if (!pending) {
    pending = fetch("/api/giveaway/status")
      .then((r) => (r.ok ? r.json() : { open: null }))
      .then((b: { open?: unknown }) => (typeof b.open === "boolean" ? b.open : null))
      .catch(() => null);
  }
  return pending;
}

export function useGiveawayOpen(): boolean | null {
  const [open, setOpen] = useState<boolean | null>(() =>
    datesOpen() ? null : false,
  );

  useEffect(() => {
    if (open === false) return;
    let alive = true;
    fetchOpen().then((v) => {
      if (alive) setOpen(v);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  return open;
}
