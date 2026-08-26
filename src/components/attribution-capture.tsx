"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { captureAttribution } from "@/lib/attribution";

/**
 * Records the first-touch traffic source, once per visitor.
 *
 * Mounted in the root layout so it runs whatever page the ad points at —
 * /giveaway today, but campaigns get re-pointed and an attribution capture
 * wired to one route silently stops working when that happens.
 *
 * Runs on every route change rather than only on mount, because App Router soft
 * navigations do not remount the layout: someone landing on /giveaway and
 * moving to /sell before the effect settles would otherwise be missed.
 * captureAttribution() is a no-op once a first touch is held, so the repeat
 * calls cost nothing.
 *
 * Deliberately renders nothing and never suspends. This is analytics — it must
 * not be able to affect what the visitor sees.
 *
 * NOT useSearchParams(): that forces a Suspense boundary and de-opts every
 * statically rendered page into client rendering. captureAttribution() reads
 * window.location.search itself inside the effect, which is the same data with
 * none of the rendering consequences.
 */
export function AttributionCapture() {
  const pathname = usePathname();

  useEffect(() => {
    captureAttribution();
  }, [pathname]);

  return null;
}
