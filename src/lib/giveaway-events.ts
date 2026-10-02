import { viewSessionId } from "@/lib/session-id";
import { reportTrackResult, trackCustomEvent } from "@/lib/meta-pixel";

/**
 * The /giveaway funnel.
 *
 * ONE SESSION ID THROUGHOUT. Every event below carries the value from
 * src/lib/session-id.ts, which is also what page_views writes on the landing
 * view. That is the only thing stitching a view to the entry and the signup
 * that followed it, which is why it comes from one module rather than a
 * constant re-declared per writer.
 *
 * THE DATABASE IS THE RECORD; THE PIXEL IS A COPY. Each event is written to
 * giveaway_events first and reported to Meta second. Meta silently
 * under-reported ListingCreated for roughly 22 listings, so when the two
 * disagree the table is right. Nothing here should ever be answered from Ads
 * Manager alone.
 *
 * NO PERSONAL DATA, BY CONSTRUCTION. The payload built here is a session id,
 * an event name and — for rejections — a reason. There is no email, name, ZIP
 * or entry id in it, the API route reads the body field by field so a future
 * caller cannot smuggle one in, and since 037 the table has no column that
 * could hold one anyway.
 */

export const GIVEAWAY_EVENTS = [
  /** The landing page loaded. */
  "giveaway_view",
  /** An email was accepted and s2 was shown. Nothing is written at this point. */
  "entry_step1_submitted",
  /** A sweepstakes_entries row was written. */
  "entry_completed",
  /** An attempt to write one was refused. Carries a reason. */
  "entry_rejected",
  /** "List your gear" on s3 — only seen by people who entered. */
  "listing_cta_clicked",
  /** "Start listing" in the hero, before any entry. The ads promised listing;
   *  until this existed the page only offered it after an entry. */
  "hero_listing_cta_clicked",
  /** "List your gear" in the header. Was an in-page anchor until 2026-09-30. */
  "header_listing_cta_clicked",
  /** "Or see what DFW families are selling" on s3. */
  "marketplace_link_clicked",
  /** "Win a $500 bat" in the site header — the organic way in. Fires on the
   *  page the visitor was on, before they reach /giveaway. */
  "site_header_giveaway_clicked",
  /** An account was created in the same visit as the listing CTA tap. */
  "signup_completed",
] as const;

export type GiveawayEvent = (typeof GIVEAWAY_EVENTS)[number];

/**
 * Why an entry attempt failed.
 *
 * Three buckets, because three is what a decision gets made on. bad_zip is the
 * eligibility rule working as intended and is not a bug; duplicate_today is
 * someone who already entered and is a sign the page is working; `other` is
 * the bucket worth watching, because a rise in it means something is broken.
 */
export const REJECTION_REASONS = ["bad_zip", "duplicate_today", "other"] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

/**
 * Map the handler's error codes onto those buckets.
 *
 * Anything unrecognised becomes `other` rather than being dropped: an event we
 * cannot classify still counts as a person who did not get entered.
 */
export function rejectionReason(handlerError: string | undefined): RejectionReason {
  switch (handlerError) {
    case "zip_not_texas":
      return "bad_zip";
    case "already_entered_today":
      return "duplicate_today";
    default:
      return "other";
  }
}

/**
 * The Meta custom event fired alongside each database write.
 *
 * A MAP RATHER THAN A CALL PER SITE, so the pixel cannot quietly stop firing
 * for an event that is still being recorded — which is the exact shape of the
 * ListingCreated failure, where every call site looked healthy while nothing
 * reached Meta.
 *
 * Custom rather than standard events: `Lead` and `CompleteRegistration` still
 * fire where they always did, because the campaign is optimised against them
 * and changing that mid-flight would reset learning, but both are also fired
 * elsewhere on the site and so cannot answer "did the giveaway work". These
 * can.
 *
 * The reason does NOT go to Meta. trackCustomEvent takes no payload by
 * deliberate design in lib/meta-pixel.ts, and widening it so a rejection
 * reason could ride along would open the same door an email could walk
 * through. Rejection reasons are ours.
 */
const PIXEL_EVENT: Record<GiveawayEvent, string> = {
  giveaway_view: "GiveawayView",
  entry_step1_submitted: "GiveawayEntryStep1",
  entry_completed: "GiveawayEntryCompleted",
  entry_rejected: "GiveawayEntryRejected",
  listing_cta_clicked: "GiveawayListingCtaClick",
  hero_listing_cta_clicked: "GiveawayHeroListingCtaClick",
  header_listing_cta_clicked: "GiveawayHeaderListingCtaClick",
  marketplace_link_clicked: "GiveawayMarketplaceClick",
  site_header_giveaway_clicked: "GiveawaySiteHeaderClick",
  signup_completed: "GiveawaySignupCompleted",
};

/**
 * The listing CTA tap, held across the signup round trip.
 *
 * signup_completed has to be attributable to the tap that caused it, and by
 * the time an account exists the visitor is on /welcome or /sell with the
 * giveaway page long gone. So the tap records what it knows at the moment it
 * happens: the session id, and nothing else.
 *
 * sessionStorage, not localStorage: "signed up in the same visit as the tap"
 * is exactly the claim being made, and a mark that outlived the tab would let
 * a signup a week later claim credit.
 */
const CTA_MARK_KEY = "ng_giveaway_cta";

export function markListingCtaClick(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(CTA_MARK_KEY, viewSessionId() ?? "");
  } catch {
    // Private modes can refuse storage. The click is still recorded; only the
    // later signup attribution is lost.
  }
}

/**
 * Read and clear the mark. Consuming it is what makes signup_completed fire at
 * most once per tap — both signup paths call this, and the second to run finds
 * nothing.
 */
function consumeListingCtaMark(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CTA_MARK_KEY);
    if (raw === null) return null;
    window.sessionStorage.removeItem(CTA_MARK_KEY);
    return raw;
  } catch {
    return null;
  }
}

/**
 * Write one event, then report it to the pixel.
 *
 * That order is the point: if only one of the two can happen it must be the
 * one we can audit.
 *
 * Fire and forget, every error swallowed. `keepalive` so the request survives
 * a navigation — without it the browser cancels an in-flight fetch on unload,
 * and the CTA click, the one event that by definition precedes a navigation,
 * would be the least likely of the seven to be recorded.
 */
export function recordGiveawayEvent(
  event: GiveawayEvent,
  options?: { reason?: RejectionReason; sessionId?: string | null },
): void {
  if (typeof window === "undefined") return;

  const sessionId =
    options?.sessionId !== undefined ? options.sessionId : viewSessionId();

  void fetch("/api/giveaway/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event,
      session_id: sessionId,
      reason: options?.reason ?? null,
    }),
    keepalive: true,
  }).catch(() => {});

  const pixelEvent = PIXEL_EVENT[event];
  reportTrackResult(pixelEvent, trackCustomEvent(pixelEvent));
}

/**
 * Fire signup_completed only if this signup followed a tap on the giveaway
 * success state. Called from both signup paths; the mark is consumed, so only
 * the first to run records anything.
 *
 * The session id comes from the mark rather than from storage, so the event
 * joins to the giveaway visit even though it fires on a different page.
 */
export function recordGiveawaySignupIfAttributed(): void {
  const marked = consumeListingCtaMark();
  if (marked === null) return;
  recordGiveawayEvent("signup_completed", { sessionId: marked || null });
}
