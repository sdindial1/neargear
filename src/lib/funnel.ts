import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The funnel queries, in one place so /admin/signups and any later export read
 * the same definitions.
 *
 * EVERY COUNT HERE EXCLUDES SEED LISTINGS AND FOUNDER ACCOUNTS, and the rules
 * are stated once rather than re-derived per query:
 *
 *   REAL ACCOUNT   users.sweepstakes_eligible = true AND email not demo.%
 *                  sweepstakes_eligible is FALSE for the 8 founder addresses
 *                  and the 5 Sponsor-controlled demo accounts (migrations 033
 *                  and 034), so it is already the "not us" flag. Reusing it
 *                  beats a second hardcoded email list that would drift.
 *
 *   REAL LISTING   listings.source = 'organic' (migration 028) AND the seller
 *                  is a REAL ACCOUNT. Both halves are needed: source alone
 *                  still counts founders' own listings, and seller alone would
 *                  count a seed listing if one were ever reassigned.
 *
 * Numbers that come out of here are deliberately smaller than the raw table
 * counts. That is the point — the raw counts are flattering and meaningless.
 */

export const REAL_ACCOUNT_RULE =
  "users.sweepstakes_eligible = true AND email NOT LIKE 'demo.%@neargear.com'";
export const REAL_LISTING_RULE =
  "listings.source = 'organic' AND seller is a REAL ACCOUNT";

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
  /** Conversion from the previous step, as a percentage. Null for the first. */
  fromPrevPct: number | null;
  note: string;
}

export interface FunnelBySource {
  source: string;
  views: number;
  signups: number;
  listers: number;
  listings: number;
}

export interface SignupRow {
  id: string;
  email: string;
  created_at: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  terms_accepted_at: string | null;
  listings_count: number;
  first_listing_at: string | null;
  days_to_first_listing: number | null;
  is_founder: boolean;
}

const DEMO = "demo.%@neargear.com";

/** Rows for the signups table. Founders included but flagged, not hidden. */
export async function loadSignups(
  admin: SupabaseClient,
  days = 30,
): Promise<SignupRow[]> {
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  const { data: users } = await admin
    .from("users")
    .select(
      "id, email, created_at, attribution_utm_source, attribution_utm_medium, " +
        "attribution_utm_campaign, terms_accepted_at, sweepstakes_eligible",
    )
    .gte("created_at", since)
    .not("email", "like", DEMO)
    .order("created_at", { ascending: false });

  const rows = (users ?? []) as unknown as Array<Record<string, unknown>>;
  if (rows.length === 0) return [];

  const ids = rows.map((u) => u.id as string);

  // Only REAL listings count toward "did they list". A founder's own listing
  // still shows, because founders are flagged rather than removed.
  const { data: listings } = await admin
    .from("listings")
    .select("seller_id, created_at, source")
    .in("seller_id", ids)
    .eq("source", "organic")
    .order("created_at", { ascending: true });

  const byseller = new Map<string, { count: number; first: string }>();
  for (const l of (listings ?? []) as Array<{ seller_id: string; created_at: string }>) {
    const cur = byseller.get(l.seller_id);
    if (cur) cur.count += 1;
    else byseller.set(l.seller_id, { count: 1, first: l.created_at });
  }

  return rows.map((u) => {
    const agg = byseller.get(u.id as string);
    const createdAt = u.created_at as string;
    const days =
      agg?.first != null
        ? (Date.parse(agg.first) - Date.parse(createdAt)) / 86400_000
        : null;
    return {
      id: u.id as string,
      email: u.email as string,
      created_at: createdAt,
      utm_source: (u.attribution_utm_source as string) ?? null,
      utm_medium: (u.attribution_utm_medium as string) ?? null,
      utm_campaign: (u.attribution_utm_campaign as string) ?? null,
      terms_accepted_at: (u.terms_accepted_at as string) ?? null,
      listings_count: agg?.count ?? 0,
      first_listing_at: agg?.first ?? null,
      days_to_first_listing: days == null ? null : Math.round(days * 10) / 10,
      is_founder: u.sweepstakes_eligible === false,
    };
  });
}

function pct(n: number, of: number): number | null {
  if (of === 0) return null;
  return Math.round((n / of) * 1000) / 10;
}

/** The five funnel steps over a trailing window. */
export async function loadFunnel(
  admin: SupabaseClient,
  days = 30,
): Promise<{ steps: FunnelStep[]; biggestDrop: string }> {
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  const { count: giveawayViews } = await admin
    .from("page_views")
    .select("id", { count: "exact", head: true })
    .eq("path", "/giveaway")
    .gte("created_at", since);

  // auth.users is not reachable through PostgREST, so "started" is approximated
  // by public.users. Those counts are currently identical (25/25, verified), so
  // the approximation costs nothing today — but it WILL understate if a signup
  // ever fails between auth row and profile row, which is exactly the OAuth gap
  // that had to be fixed. Labelled honestly in the UI rather than presented as
  // a measured distinction.
  const { count: signups } = await admin
    .from("users")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since)
    .not("email", "like", DEMO)
    .eq("sweepstakes_eligible", true);

  const { data: realUsers } = await admin
    .from("users")
    .select("id")
    .gte("created_at", since)
    .not("email", "like", DEMO)
    .eq("sweepstakes_eligible", true);
  const realIds = ((realUsers ?? []) as Array<{ id: string }>).map((u) => u.id);

  let listers = 0;
  let listingCount = 0;
  if (realIds.length) {
    const { data: ls } = await admin
      .from("listings")
      .select("seller_id")
      .in("seller_id", realIds)
      .eq("source", "organic");
    const rows = (ls ?? []) as Array<{ seller_id: string }>;
    listingCount = rows.length;
    listers = new Set(rows.map((r) => r.seller_id)).size;
  }

  const v = giveawayViews ?? 0;
  const s = signups ?? 0;

  const steps: FunnelStep[] = [
    {
      key: "views",
      label: "Giveaway page views",
      count: v,
      fromPrevPct: null,
      note: v === 0 ? "logging just deployed — no data yet" : "our own count, not Meta's",
    },
    {
      key: "signups",
      label: "Signups completed",
      count: s,
      fromPrevPct: pct(s, v),
      note: "non-founder, non-demo accounts",
    },
    {
      key: "listers",
      label: "Accounts with ≥1 real listing",
      count: listers,
      fromPrevPct: pct(listers, s),
      note: "organic listings only",
    },
    {
      key: "listings",
      label: "Real listings posted",
      count: listingCount,
      fromPrevPct: pct(listingCount, listers),
      note: "per-lister average, not a drop-off",
    },
  ];

  // Biggest drop-off, ignoring the last step (which is a multiplier, not a
  // funnel stage) and any step whose predecessor was zero.
  let worst = "not enough data";
  let worstPct = 101;
  for (const st of steps.slice(1, 3)) {
    if (st.fromPrevPct != null && st.fromPrevPct < worstPct) {
      worstPct = st.fromPrevPct;
      worst = `${st.label} — only ${st.fromPrevPct}% of the previous step`;
    }
  }

  return { steps, biggestDrop: worst };
}

/** Funnel split by traffic source, so paid and organic are separable. */
export async function loadBySource(
  admin: SupabaseClient,
  days = 30,
): Promise<FunnelBySource[]> {
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  const { data: views } = await admin
    .from("page_views")
    .select("utm_source")
    .gte("created_at", since);
  const { data: users } = await admin
    .from("users")
    .select("id, attribution_utm_source")
    .gte("created_at", since)
    .not("email", "like", DEMO)
    .eq("sweepstakes_eligible", true);

  const key = (s: string | null | undefined) => s?.trim() || "(direct / unknown)";
  const map = new Map<string, FunnelBySource>();
  const get = (k: string) => {
    let e = map.get(k);
    if (!e) {
      e = { source: k, views: 0, signups: 0, listers: 0, listings: 0 };
      map.set(k, e);
    }
    return e;
  };

  for (const v of (views ?? []) as Array<{ utm_source: string | null }>) {
    get(key(v.utm_source)).views += 1;
  }

  const userRows = (users ?? []) as Array<{ id: string; attribution_utm_source: string | null }>;
  const sourceByUser = new Map<string, string>();
  for (const u of userRows) {
    const k = key(u.attribution_utm_source);
    sourceByUser.set(u.id, k);
    get(k).signups += 1;
  }

  if (userRows.length) {
    const { data: ls } = await admin
      .from("listings")
      .select("seller_id")
      .in("seller_id", userRows.map((u) => u.id))
      .eq("source", "organic");
    const seen = new Set<string>();
    for (const l of (ls ?? []) as Array<{ seller_id: string }>) {
      const k = sourceByUser.get(l.seller_id);
      if (!k) continue;
      get(k).listings += 1;
      if (!seen.has(l.seller_id)) {
        seen.add(l.seller_id);
        get(k).listers += 1;
      }
    }
  }

  return [...map.values()].sort((a, b) => b.views - a.views || b.signups - a.signups);
}
