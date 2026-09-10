"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { viewSessionId } from "@/lib/session-id";

/**
 * Records views of /giveaway and /sell, server-side, so the funnel has a first
 * step we measured rather than one Meta reported.
 *
 * Mounted in the root layout rather than on the two pages, for the same reason
 * AttributionCapture is: a component wired into one route stops working
 * silently when that route is refactored or the campaign is re-pointed. The
 * allowlist below decides what gets logged, and the API route enforces the same
 * list — a client-side allowlist is a suggestion, not a boundary.
 *
 * ONE LOG PER PATH PER MOUNT. A ref-keyed set guards against StrictMode's
 * double-invoked effects in development and against re-renders. Navigating
 * away and back does log again, which is correct: that is a second view.
 *
 * Fire and forget, every error swallowed, no await anywhere near render. This
 * is measurement on a page a paying visitor is looking at.
 */

const LOGGED_PATHS = new Set(["/giveaway", "/sell"]);

export function PageViewLogger() {
  const pathname = usePathname();
  const sent = useRef<Set<string>>(new Set());

  useEffect(() => {
    const path = pathname ?? "/";
    if (!LOGGED_PATHS.has(path)) return;
    if (sent.current.has(path)) return;
    sent.current.add(path);

    // Read directly rather than via useSearchParams: that hook forces a
    // Suspense boundary and de-opts statically rendered pages into client
    // rendering. Same reasoning as AttributionCapture.
    const params = new URLSearchParams(window.location.search);

    // A same-origin referrer is internal navigation, not a traffic source.
    let referrer: string | null = null;
    if (document.referrer) {
      try {
        referrer =
          new URL(document.referrer).origin === window.location.origin
            ? null
            : document.referrer;
      } catch {
        referrer = document.referrer;
      }
    }

    void fetch("/api/pageview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path,
        utm_source: params.get("utm_source"),
        utm_medium: params.get("utm_medium"),
        utm_campaign: params.get("utm_campaign"),
        fbclid: params.get("fbclid"),
        referrer,
        session_id: viewSessionId(),
      }),
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);

  return null;
}
