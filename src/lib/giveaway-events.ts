import { readAttribution } from "@/lib/attribution";
import { viewSessionId } from "@/lib/session-id";
import { reportTrackResult, trackCustomEvent } from "@/lib/meta-pixel";

/**
 * The giveaway funnel, after the view.
 *
 * page_views already answers "did anyone land". These answer what the rebuild
 * is actually a bet on: that moving the listing ask to AFTER a free entry
 * converts better than leading with it. Every one of these is written to our
 * own database first and fired at the Meta pixel second - when the two
 * disagree, the table wins. The pixel silently under-reported ListingCreated
 * for roughly 22 listings, which is precisely why it is not the record.
 *
 * NOTHING HERE CARRIES PERSONAL DATA. No email, no name, no ZIP. The API route
 * reads the body field by field and would drop it anyway, but the payload is
 * built here and it is built without any.
 */

export const GIVEAWAY_EVENTS = [
  /** A free entry was accepted and a sweepstakes_entries row now exists. */
  "entry_submitted",
  /** The post-entry "list gear" CTA was tapped from the success state. */
  "listing_cta_clicked",
  /** An account was created in the same visit as that tap. */
  "signup_completed",
] as const;

export type GiveawayEvent = (typeof GIVEAWAY_EVENTS)[number];

/**
 * The Meta custom event fired alongside each database write.
 *
 * A MAP RATHER THAN A CALL AT EACH SITE. Both halves of "store it and report
 * it" leave from one function below, so the pixel cannot quietly stop firing
 * for an event that is still being recorded — which is the exact shape of the
 * ListingCreated failure, where the call site looked healthy for ~22 listings
 * while nothing reached Meta.
 *
 * Custom rather than standard events on purpose. `Lead` and
 * `CompleteRegistration` still fire where they always did — the campaign is
 * optimised against them and changing that mid-flight would reset learning —
 * but they are also fired by other parts of the site, so they cannot answer
 * "did the giveaway rebuild work". These can.
 */
const PIXEL_EVENT: Record<GiveawayEvent, string> = {
  entry_submitted: "GiveawayEntry",
  listing_cta_clicked: "GiveawayListingCtaClick",
  signup_completed: "GiveawaySignupCompleted",
};

/** The landing view. Distinct from the snippet's own site-wide PageView. */
const PIXEL_PAGE_VIEW = "GiveawayPageView";

/**
 * Report the /giveaway landing view to the pixel.
 *
 * NO DATABASE WRITE HERE. page_views already records this view server-side via
 * PageViewLogger, and has 518 rows of history under it; writing a second row
 * from a second place would double-count the one step of this funnel that was
 * already measured correctly.
 */
export function recordGiveawayPageView(): void {
  if (typeof window === "undefined") return;
  reportTrackResult(PIXEL_PAGE_VIEW, trackCustomEvent(PIXEL_PAGE_VIEW));
}

/**
 * Campaign parameters for an event.
 *
 * Read from the stored first touch when there is one, and from the current URL
 * otherwise. The URL is the fallback rather than the primary because
 * captureAttribution() refuses to store a record that says nothing - a direct
 * visit has no first touch, and reading the URL still gets the ad parameters on
 * the landing view itself.
 */
interface CampaignParams {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  fbclid: string | null;
}

function campaignParams(): CampaignParams {
  const stored = readAttribution();
  if (stored) {
    return {
      utm_source: stored.utmSource,
      utm_medium: stored.utmMedium,
      utm_campaign: stored.utmCampaign,
      fbclid: stored.fbclid,
    };
  }
  if (typeof window === "undefined") {
    return { utm_source: null, utm_medium: null, utm_campaign: null, fbclid: null };
  }
  const p = new URLSearchParams(window.location.search);
  return {
    utm_source: p.get("utm_source"),
    utm_medium: p.get("utm_medium"),
    utm_campaign: p.get("utm_campaign"),
    fbclid: p.get("fbclid"),
  };
}

/**
 * The listing CTA click, held across the signup round trip.
 *
 * signup_completed has to be attributable to the tap that caused it, and by the
 * time an account exists the visitor is on /welcome or /sell: the giveaway page
 * is gone, and clearAttribution() has already run as part of a successful
 * signup. So the tap records what it knows at the moment it happens.
 *
 * sessionStorage, not localStorage: "signed up in the same visit as the tap" is
 * exactly the claim being made, and a mark that outlived the tab would let a
 * signup a week later claim credit.
 */
const CTA_MARK_KEY = "ng_giveaway_cta";

interface CtaMark extends CampaignParams {
  session_id: string | null;
}

export function markListingCtaClick(): void {
  if (typeof window === "undefined") return;
  try {
    const mark: CtaMark = { session_id: viewSessionId(), ...campaignParams() };
    window.sessionStorage.setItem(CTA_MARK_KEY, JSON.stringify(mark));
  } catch {
    // ignore
  }
}

/**
 * Read and clear the mark. Consuming it is what makes signup_completed fire at
 * most once per tap - both signup paths call this, and the second one to run
 * finds nothing.
 */
export function consumeListingCtaMark(): CtaMark | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CTA_MARK_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(CTA_MARK_KEY);
    return JSON.parse(raw) as CtaMark;
  } catch {
    return null;
  }
}

/**
 * Write one event to our database, then report it to the pixel.
 *
 * THAT ORDER IS THE POINT. The database is the source of truth and the pixel
 * is a copy sent to a party that has under-reported before; if only one of the
 * two can happen, it must be the one we can audit.
 *
 * Fire and forget, every error swallowed. `keepalive` so the request survives
 * a navigation - without it the browser cancels an in-flight fetch on unload
 * and the CTA click, the one event that by definition precedes a navigation,
 * would be the least likely of the four to be recorded.
 */
export function recordGiveawayEvent(
  event: GiveawayEvent,
  overrides?: Partial<CtaMark>,
): void {
  if (typeof window === "undefined") return;
  const base: CtaMark = { session_id: viewSessionId(), ...campaignParams() };
  void fetch("/api/giveaway/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, ...base, ...(overrides ?? {}) }),
    keepalive: true,
  }).catch(() => {});

  const pixelEvent = PIXEL_EVENT[event];
  reportTrackResult(pixelEvent, trackCustomEvent(pixelEvent));
}

/**
 * Fire signup_completed only if this signup followed a tap on the giveaway
 * success state. Called from both signup paths (password and OAuth); the mark
 * is consumed, so only the first to run records anything.
 */
export function recordGiveawaySignupIfAttributed(): void {
  const mark = consumeListingCtaMark();
  if (!mark) return;
  recordGiveawayEvent("signup_completed", mark);
}
