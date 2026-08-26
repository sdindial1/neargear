"use client";

import { useEffect, useRef } from "react";
import { attributionColumns, clearAttribution } from "@/lib/attribution";
import { reportTrackResult, trackStandard } from "@/lib/meta-pixel";

/**
 * Finishes an OAuth signup on the first page that is NOT pixel-suppressed.
 *
 * Two things happen here and nowhere else on the Google path:
 *
 *   ATTRIBUTION. First-touch fbclid, utm parameters and referrer live in
 *   localStorage on our origin. They survive the round trip to Google and back —
 *   localStorage is origin-scoped and untouched by leaving the site — but
 *   /auth/callback is a server route and cannot read them. So the value is
 *   carried across by the browser, here, once a session exists.
 *
 *   CompleteRegistration. The password path fires it inside
 *   `if (signUpData.user)`, after the account genuinely exists. The equivalent
 *   moment on the OAuth path is this page: the callback has already created the
 *   profile row, so an account provably exists by the time this runs. It is
 *   deliberately NOT fired in /auth/callback — that URL carries an auth code
 *   and the pixel transmits document.location.href.
 *
 * Runs once per mount, guarded by a ref: React 18 StrictMode double-invokes
 * effects in development, and firing a conversion event twice would corrupt the
 * campaign data this exists to protect.
 */
export function PostAuthBootstrap({ isNew }: { isNew: boolean }) {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const columns = attributionColumns();

    const run = async () => {
      // Only worth a request if there is something to carry. The route is
      // first-write-wins, so a redundant call is harmless — but a no-op request
      // on every welcome view is not free.
      if (Object.keys(columns).length > 0) {
        try {
          const res = await fetch("/api/auth/bootstrap", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(columns),
            keepalive: true,
          });
          // Cleared only on a confirmed write. If the request failed the
          // attribution stays in localStorage and the next authenticated
          // landing tries again — losing it here would be permanent.
          if (res.ok) clearAttribution();
        } catch {
          // Never surfaced. A failed analytics write must not disturb a signup.
        }
      }

      if (isNew) {
        reportTrackResult("CompleteRegistration", trackStandard("CompleteRegistration"));
      }
    };

    void run();
  }, [isNew]);

  return null;
}
