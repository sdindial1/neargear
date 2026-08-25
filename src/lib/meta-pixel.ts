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

/**
 * The base snippet installs a STUB first and swaps in the real implementation
 * when fbevents.js arrives. Both are functions, which is exactly what made this
 * hard to see: a truthy `window.fbq` says nothing about whether a call actually
 * left the browser.
 *
 *   callMethod  present only once fbevents.js has loaded. Its absence means
 *               every call so far is sitting in `queue`, unsent.
 *   queue       the stub's buffer, flushed on load. A non-empty queue after a
 *               few seconds means the script is blocked or failing.
 */
type Fbq = ((...args: FbqArgs) => void) & {
  callMethod?: (...args: FbqArgs) => void;
  queue?: unknown[];
  loaded?: boolean;
};

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

/**
 * What actually happened to a track call.
 *
 * These used to all collapse into "a string was returned", which is how
 * ListingCreated went ~22 listings without ever reaching Meta while every call
 * site saw an event id come back and assumed success. An outcome type is the
 * fix for that class of bug: "the operation errored" and "the operation
 * legitimately did nothing" must never share a return value.
 */
export type DispatchStatus =
  /** No NEXT_PUBLIC_META_PIXEL_ID — local dev and preview. Expected, not a fault. */
  | "disabled"
  /** GPC asserted; the pixel was deliberately never loaded. Expected. */
  | "opted_out"
  /** window.fbq undefined — the base snippet never ran on this page. */
  | "absent"
  /** Buffered in the stub's queue. NOT sent. Sends only if fbevents.js loads. */
  | "queued"
  /** fbevents.js is live and the call went to it. */
  | "dispatched";

export interface TrackResult {
  status: DispatchStatus;
  /** Null unless the call was queued or dispatched. */
  eventID: string | null;
  /** Stub buffer depth at call time. Non-zero with status "queued" = backlog. */
  queueDepth: number;
}

function fbqRef(): Fbq | null {
  if (typeof window === "undefined") return null;
  return window.fbq ?? null;
}

/**
 * True once fbevents.js has replaced the stub. This is the single check that
 * distinguishes "sent" from "buffered", and nothing in the old wrapper had it.
 */
export function pixelScriptLoaded(): boolean {
  return typeof fbqRef()?.callMethod === "function";
}

/** Stub buffer depth — diagnostic only. */
export function pixelQueueDepth(): number {
  return fbqRef()?.queue?.length ?? 0;
}

function dispatch(
  kind: "track" | "trackCustom",
  event: string,
): TrackResult {
  if (!metaPixelEnabled()) {
    return { status: "disabled", eventID: null, queueDepth: 0 };
  }
  if (privacySignalOptOut()) {
    return { status: "opted_out", eventID: null, queueDepth: 0 };
  }
  const fbq = fbqRef();
  if (!fbq) {
    return { status: "absent", eventID: null, queueDepth: 0 };
  }

  const eventID = newEventId();
  const loaded = pixelScriptLoaded();
  // The empty third argument is required positionally to reach the options
  // object where eventID lives. It is intentionally empty — see the file header.
  if (kind === "track") {
    fbq("track", event as MetaStandardEvent, {}, { eventID });
  } else {
    fbq("trackCustom", event, {}, { eventID });
  }

  return {
    status: loaded ? "dispatched" : "queued",
    eventID,
    queueDepth: pixelQueueDepth(),
  };
}

/** Fire a Meta standard event. */
export function trackStandard(event: MetaStandardEvent): TrackResult {
  return dispatch("track", event);
}

/** Fire a Meta custom event (e.g. ListingCreated). */
export function trackCustomEvent(event: string): TrackResult {
  return dispatch("trackCustom", event);
}

export function trackPageView(): void {
  trackStandard("PageView");
}

/**
 * Fire an event and give it a real chance to leave the browser before the
 * caller navigates.
 *
 * Two failure modes this addresses, both invisible before:
 *
 *   1. The call lands while only the stub exists, so it is buffered rather than
 *      sent. We wait (briefly) for fbevents.js so the call goes out directly
 *      instead of depending on a later flush.
 *   2. The call is dispatched but the caller navigates in the same tick. We
 *      yield afterwards so the request is handed to the network first.
 *
 * ALWAYS RESOLVES. Ad instrumentation must never be able to block or fail a
 * user action — the seller's listing matters, the conversion event does not.
 * On timeout it fires anyway and reports "queued", which is the honest answer:
 * buffered, not sent.
 */
export async function trackCustomEventBeforeUnload(
  event: string,
  { timeoutMs = 1500 }: { timeoutMs?: number } = {},
): Promise<TrackResult> {
  if (!metaPixelEnabled()) {
    return { status: "disabled", eventID: null, queueDepth: 0 };
  }
  if (privacySignalOptOut()) {
    return { status: "opted_out", eventID: null, queueDepth: 0 };
  }

  // Wait for the real implementation, but only briefly.
  if (!pixelScriptLoaded()) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && !pixelScriptLoaded()) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  const result = trackCustomEvent(event);

  // Hand the beacon to the network before the caller's navigation runs. Two
  // macrotask turns is enough for fbevents.js to issue its request; without
  // this the send and a synchronous router.push() race in the same tick.
  if (result.status === "dispatched") {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  }

  return result;
}

/**
 * Console reporting for a track outcome.
 *
 * Deliberately loud for "queued" and "absent": those are the states that look
 * like success from the call site and are the reason this went unnoticed for
 * ~22 listings. "disabled" is silent — it is the normal state locally and on
 * preview, and warning about it would train everyone to ignore the channel.
 */
export function reportTrackResult(event: string, result: TrackResult): void {
  const tag = `[meta-pixel] ${event}`;
  switch (result.status) {
    case "dispatched":
      console.info(`${tag}: sent (eventID ${result.eventID})`);
      break;
    case "queued":
      console.warn(
        `${tag}: BUFFERED, NOT SENT — fbevents.js has not loaded. ` +
          `queue depth ${result.queueDepth}. It will only reach Meta if the ` +
          `script loads later in this session.`,
      );
      break;
    case "absent":
      console.warn(`${tag}: window.fbq is undefined — the base snippet never ran.`);
      break;
    case "opted_out":
      console.info(`${tag}: skipped, Global Privacy Control is asserted.`);
      break;
    case "disabled":
      break;
  }
}
