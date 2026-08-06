"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import {
  META_PIXEL_ID,
  metaPixelEnabled,
  privacySignalOptOut,
  trackPageView,
} from "@/lib/meta-pixel";

/**
 * Meta Pixel base code, mounted once in the root layout.
 *
 * STRATEGY: afterInteractive, which the Next 16 Script docs name as the
 * strategy for tag managers and analytics — it loads early but after hydration
 * begins, so it never blocks render. beforeInteractive would be wrong: that is
 * reserved for consent managers and bot detection, and would put Meta's script
 * ahead of our own code.
 *
 * SPA PAGEVIEWS: the base snippet fires PageView exactly once, when it loads.
 * App Router soft navigations do not reload it, so without the effect below
 * every route change after the first would go uncounted. The first effect run
 * is skipped because the snippet already covered that load — firing there too
 * is the double-count bug most Next.js pixel installs ship with.
 */

/**
 * Routes where the pixel must not run.
 *
 * /auth/reset-password is the one that matters: it establishes the session from
 * the URL (Supabase detectSessionInUrl), so the page loads with a recovery
 * token in the address bar — and the pixel transmits document.location.href.
 * Firing there would hand Meta a live credential. The others carry no ad value
 * and the same class of risk, so they are excluded rather than reasoned about.
 */
const SUPPRESSED_PREFIXES = [
  "/auth/reset-password",
  "/auth/forgot-password",
  "/auth/callback",
  "/admin",
];

function isSuppressed(path: string): boolean {
  return SUPPRESSED_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
}

export function MetaPixel() {
  const pathname = usePathname();
  const path = pathname ?? "/";
  const suppressed = isSuppressed(path);

  /**
   * null until mounted, so the server and the first client render both produce
   * nothing and cannot disagree. Reading GPC during render would be a hydration
   * mismatch (the server has no navigator); flipping it in an effect after the
   * script had already been injected would be a race we would lose. Deciding
   * one tick later costs nothing for an afterInteractive script.
   */
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    setAllowed(!privacySignalOptOut());
  }, []);

  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (suppressed) return;
    // No-ops harmlessly if the pixel has not loaded yet — for example when the
    // landing route was suppressed and the snippet is only mounting now. In
    // that case the snippet's own PageView covers this navigation, so the
    // count stays at exactly one either way.
    trackPageView();
  }, [path, suppressed]);

  if (!metaPixelEnabled() || allowed !== true || suppressed) return null;

  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');`}
    </Script>
  );
}

/**
 * Meta's standard install also includes a <noscript> tracking image. It is
 * omitted deliberately: the GPC opt-out this component honors is evaluated in
 * JavaScript, so a JS-less fallback would fire for exactly the users who cannot
 * be checked for an opt-out signal — bypassing the commitment in the privacy
 * policy. The recovered volume from JS-disabled browsers is not worth breaking
 * that promise.
 */
