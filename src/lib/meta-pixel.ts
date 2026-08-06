/**
 * Meta Pixel — a deliberately narrow wrapper.
 *
 * THE PRIVACY GUARANTEE IS THE FUNCTION SIGNATURES.
 * None of the exported track functions accept a data payload. There is no
 * parameter through which an email, name, phone or ZIP could reach Meta, so
 * "don't send PII" is enforced by the type system rather than by remembering.
 * If a future event genuinely needs a value attached, add an explicit
 * allow-listed type — do not widen these to `Record<string, unknown>`.
 *
 * WHAT THIS CANNOT CONTROL: Automatic Advanced Matching is a toggle in Meta
 * Events Manager, not a snippet setting. With it ON, Meta's script reads form
 * fields on the page and sends hashed email/phone/name regardless of anything
 * written here. /giveaway/free-entry and /auth/signup both render exactly those
 * fields. It must stay OFF in Events Manager for the guarantee above to hold.
 *
 * Everything no-ops when NEXT_PUBLIC_META_PIXEL_ID is unset, which is how local
 * dev and Vercel preview stay out of the ad account's event stream.
 */

type FbqArgs =
  | [command: "init", pixelId: string]
  | [command: "track", event: string, custom: Record<string, never>, options: { eventID: string }]
  | [command: "trackCustom", event: string, custom: Record<string, never>, options: { eventID: string }];

type Fbq = (...args: FbqArgs) => void;

declare global {
  interface Window {
    fbq?: Fbq;
  }
}

/** Standard events we fire. Restricted to the ones actually wired up. */
export type MetaStandardEvent = "PageView" | "CompleteRegistration" | "Lead";

export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";

export function metaPixelEnabled(): boolean {
  return META_PIXEL_ID.length > 0;
}

/**
 * Global Privacy Control. The privacy policy commits to honoring browser
 * opt-out signals, so we check one rather than retract the promise: when GPC is
 * asserted the pixel is never loaded at all, which is stronger (and simpler)
 * than loading it and trying to suppress events afterwards.
 */
export function privacySignalOptOut(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    (navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl === true
  );
}

/**
 * Per-event id, returned so a future Conversions API call can send the same id
 * server-side and let Meta deduplicate the pair. Unused by the browser-only
 * install, but retrofitting ids after events are already flowing means a window
 * of double-counted conversions, so they are generated from the start.
 */
function newEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Non-secure contexts and older Safari lack randomUUID. Collision resistance
  // only has to hold within one user's session for dedup to work.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function ready(): Fbq | null {
  if (!metaPixelEnabled()) return null;
  if (typeof window === "undefined") return null;
  return window.fbq ?? null;
}

/** Fire a Meta standard event. Returns the event id, or null if the pixel is off. */
export function trackStandard(event: MetaStandardEvent): string | null {
  const fbq = ready();
  if (!fbq) return null;
  const eventID = newEventId();
  // The empty third argument is required positionally to reach the options
  // object where eventID lives. It is intentionally empty — see the file header.
  fbq("track", event, {}, { eventID });
  return eventID;
}

/** Fire a Meta custom event (e.g. ListingCreated). */
export function trackCustomEvent(event: string): string | null {
  const fbq = ready();
  if (!fbq) return null;
  const eventID = newEventId();
  fbq("trackCustom", event, {}, { eventID });
  return eventID;
}

export function trackPageView(): void {
  trackStandard("PageView");
}
