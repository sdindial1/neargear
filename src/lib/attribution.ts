/**
 * First-touch signup attribution.
 *
 * An ad click lands on /giveaway carrying fbclid and utm_*; the account is
 * created later on /auth/signup, possibly on a different day. The parameters
 * exist only in the URL of that first request and in document.referrer at that
 * moment, so they have to be captured on landing and carried forward — nothing
 * reconstructs them afterwards.
 *
 * FIRST-TOUCH: the stored record is written once and never overwritten while it
 * is alive. The question being answered is "which ad brought this person to
 * NearGear", and a last-touch model answers "which page were they on when they
 * finally signed up", which is nearly always the signup page itself.
 *
 * localStorage rather than sessionStorage: a seller who clicks an ad, looks
 * around, and comes back that evening is the normal case, and sessionStorage
 * dies with the tab. Bounded by ATTRIBUTION_TTL_DAYS so a click from months ago
 * is not still claiming credit.
 */

const KEY = "ng_attribution_v1";

/** After this, a stored first-touch is stale and the next landing replaces it. */
export const ATTRIBUTION_TTL_DAYS = 30;

export interface Attribution {
  fbclid: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referrer: string | null;
  landingPath: string | null;
  capturedAt: string;
}

/** Values longer than this are truncated — a column is not a URL bucket. */
const MAX_LEN = 500;

function clean(v: string | null): string | null {
  if (v == null) return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > MAX_LEN ? t.slice(0, MAX_LEN) : t;
}

function isStale(a: Attribution): boolean {
  const t = Date.parse(a.capturedAt);
  if (Number.isNaN(t)) return true;
  return Date.now() - t > ATTRIBUTION_TTL_DAYS * 24 * 60 * 60 * 1000;
}

/** Read the stored first-touch, or null. Never throws. */
export function readAttribution(): Attribution | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Attribution;
    if (!parsed?.capturedAt || isStale(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Capture the current landing if nothing live is stored. Idempotent, and safe
 * to call on every route change — the first-touch guard makes later calls
 * no-ops.
 *
 * Never throws: localStorage is unavailable in some privacy modes, and an
 * analytics helper must never be able to break a page.
 */
export function captureAttribution(): void {
  if (typeof window === "undefined") return;
  try {
    const existing = readAttribution();
    if (existing) return; // first touch already held

    const params = new URLSearchParams(window.location.search);
    const referrer = clean(document.referrer);

    // A same-origin referrer is internal navigation, not a traffic source.
    // Storing it would attribute every signup to our own marketplace page.
    let externalReferrer: string | null = null;
    if (referrer) {
      try {
        externalReferrer =
          new URL(referrer).origin === window.location.origin ? null : referrer;
      } catch {
        externalReferrer = referrer;
      }
    }

    const record: Attribution = {
      fbclid: clean(params.get("fbclid")),
      utmSource: clean(params.get("utm_source")),
      utmMedium: clean(params.get("utm_medium")),
      utmCampaign: clean(params.get("utm_campaign")),
      referrer: externalReferrer,
      landingPath: clean(window.location.pathname),
      capturedAt: new Date().toISOString(),
    };

    // Don't store a record that says nothing. A direct type-in has no fbclid,
    // no utm and no external referrer, and writing one would occupy the
    // first-touch slot — so a genuine ad click later in the TTL window would be
    // discarded as "already attributed".
    const meaningful =
      record.fbclid || record.utmSource || record.utmMedium ||
      record.utmCampaign || record.referrer;
    if (!meaningful) return;

    window.localStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    // ignore
  }
}

/** Shape written to the users row at signup. Snake_case to match the columns. */
export function attributionColumns(): Record<string, string | null> {
  const a = readAttribution();
  if (!a) return {};
  return {
    attribution_fbclid: a.fbclid,
    attribution_utm_source: a.utmSource,
    attribution_utm_medium: a.utmMedium,
    attribution_utm_campaign: a.utmCampaign,
    attribution_referrer: a.referrer,
    attribution_landing_path: a.landingPath,
    attribution_captured_at: a.capturedAt,
  };
}

/**
 * Clear after a successful signup so a shared or kiosk browser does not
 * attribute a second person's account to the first person's ad click.
 */
export function clearAttribution(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
