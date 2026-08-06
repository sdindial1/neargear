/**
 * $500 Bat Giveaway — shared constants and helpers.
 *
 * Single source of truth for the numbers that appear in the Official Rules, on
 * the landing page, and in the audit. If the rules say 500 and the page says
 * something else, the rules are what a court reads — so both read from here.
 */

/** Listings target. Reaching this ends the Promotion (Rules §3(a)). */
export const GIVEAWAY_GOAL = 500;

/** Rules §3: begins 12:00:01 a.m. Central, 2026-08-06. */
export const PROMOTION_START_ISO = "2026-08-06T05:00:01.000Z"; // 00:00:01 CDT

/** Rules §3(b): ends 11:59:59 p.m. Central, 2026-11-03. */
export const PROMOTION_END_ISO = "2026-11-03T23:59:59.000-06:00";

/** Human forms used in copy, so the page and the rules cannot drift apart. */
export const PROMOTION_START_LABEL = "August 6, 2026";
export const PROMOTION_END_LABEL = "November 3, 2026";
export const RULES_LAST_UPDATED = "August 6, 2026";

/**
 * Texas ZIP ranges.
 *
 * 75000–79999 is the bulk of the state; 88500–88599 is the El Paso block,
 * which sits outside the main range and is easy to forget — omitting it would
 * silently reject legitimate El Paso entrants.
 */
export function isTexasZip(zip: string): boolean {
  if (!/^\d{5}$/.test(zip)) return false;
  const n = Number(zip);
  return (n >= 75000 && n <= 79999) || (n >= 88500 && n <= 88599);
}

/** Basic shape check. Deliberately permissive — deliverability is not our job here. */
export function isPlausibleEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

/** Normalized form stored in the database and used for the daily-limit key. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Meter geometry for the scoreboard. Percentage is capped so the bar never overflows. */
export function scoreboard(activeCount: number) {
  const count = Math.max(0, activeCount);
  const pct = Math.min((count / GIVEAWAY_GOAL) * 100, 100);
  return {
    count,
    goal: GIVEAWAY_GOAL,
    /** One decimal place, matching the mockup's `--pct:9.4%`. */
    pct: Math.round(pct * 10) / 10,
    toGo: Math.max(GIVEAWAY_GOAL - count, 0),
    /** Rules §3(a): the Promotion ends the moment the target is reached. */
    closed: count >= GIVEAWAY_GOAL,
  };
}
