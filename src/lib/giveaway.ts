import type { SupabaseClient } from "@supabase/supabase-js";

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

/**
 * The number of entries actually in the drawing.
 *
 * THIS IS NOT THE 500-LISTING COUNTER, AND THE TWO ARE NOT CLOSE. The counter
 * is every active listing platform-wide, which is what Rules 3(a) ends the
 * Promotion on. An entry is a much narrower thing, and at the time this was
 * written 60 active listings contained 9 eligible entries: 46 of them predate
 * the Promotion and earn nothing under Rules 4.1, and 48 belong to
 * Sponsor-controlled demo, seed and founder accounts that Rules 2 excludes.
 *
 * The landing page states this number to a visitor deciding whether entering is
 * worth it, so it has to be the honest one. It is deliberately the SAME
 * definition /admin/giveaway draws the winner from - if the page and the audit
 * could disagree, the page would be the one that is wrong.
 *
 * Returns null when the count cannot be established. Callers must render
 * something truthful in that case rather than substituting a zero: "0 entries"
 * and "we could not read the database" are different statements, and only one
 * of them is a reason to enter.
 */
export interface EntryPool {
  /** Listing entries plus free entries, both filtered to eligible. */
  entries: number;
  listingEntries: number;
  freeEntries: number;
}

export async function loadEntryPool(
  admin: SupabaseClient,
): Promise<EntryPool | null> {
  try {
    // Rules 4.1: a Qualifying Listing is posted DURING the Promotion Period and
    // is STILL ACTIVE. Rules 5 voids the entry if the listing comes down, so
    // filtering on active is the rule rather than a shortcut.
    //
    // Rows are fetched and filtered here rather than counted with an embedded
    // filter. The pool is small by construction - it is bounded by the same 500
    // listings that end the Promotion - and an in-process filter cannot be
    // silently wrong the way a PostgREST embedded predicate can.
    const { data: listingRows, error: listingErr } = await admin
      .from("listings")
      .select("id, seller:users!seller_id(sweepstakes_eligible)")
      .eq("status", "active")
      .gte("created_at", PROMOTION_START_ISO)
      .lte("created_at", PROMOTION_END_ISO);

    if (listingErr) return null;

    type Seller = { sweepstakes_eligible: boolean | null };
    type Row = { seller: Seller | Seller[] | null };

    // Rules 2 excludes Sponsor personnel. sweepstakes_eligible is false for the
    // founder addresses and the Sponsor-controlled demo accounts (migrations
    // 033 and 034), so it is already the "not us" flag; a NULL is a real
    // account that predates the column and counts.
    const listingEntries = ((listingRows ?? []) as Row[]).filter((r) => {
      const seller = Array.isArray(r.seller) ? (r.seller[0] ?? null) : r.seller;
      return seller?.sweepstakes_eligible !== false;
    }).length;

    // AMOE. Already one per person per calendar day by unique index, so a row
    // is an entry with no further deduplication needed.
    const { count: freeCount, error: freeErr } = await admin
      .from("sweepstakes_entries")
      .select("id", { count: "exact", head: true })
      .not("eligible", "is", false);

    if (freeErr) return null;

    const freeEntries = freeCount ?? 0;
    return { entries: listingEntries + freeEntries, listingEntries, freeEntries };
  } catch {
    return null;
  }
}
