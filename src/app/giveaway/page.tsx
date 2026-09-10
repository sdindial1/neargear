import { createClient } from "@supabase/supabase-js";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { GiveawayLanding } from "@/components/giveaway/giveaway-landing";
import { GIVEAWAY_GOAL, loadEntryPool } from "@/lib/giveaway";

/**
 * /giveaway — the $500 Bat Giveaway landing page.
 *
 * The URL is fixed: a live Meta campaign points at it, so this file gets
 * rebuilt rather than replaced.
 *
 * TWO NUMBERS ARE READ HERE AND THEY ARE NOT THE SAME NUMBER.
 *
 *   The entry pool     what the headline states. Eligible entries only, by the
 *                      same definition /admin/giveaway draws the winner from.
 *                      Needs the service role: sweepstakes_entries is
 *                      unreachable by anon, and users.sweepstakes_eligible is
 *                      how Rules 2 exclusions are applied.
 *
 *   Active listings    NOT shown to the visitor any more. It is read only to
 *                      decide whether Rules 3(a) has ended the Promotion. The
 *                      old page put it on a progress bar reading "60 of 500 —
 *                      440 listings to go", which renders our own promotion as
 *                      12% of a failure and was doing real damage.
 *
 * Read on the server so both are correct in the HTML. A client fetch would
 * flash a placeholder, and the entry count is the page's whole credibility.
 *
 * Revalidated every 5 minutes: entries do not arrive fast enough to justify
 * realtime, and a cached page absorbs ad traffic without hitting the database
 * on every view. `revalidate` is still the supported model here because
 * cacheComponents is not enabled in next.config.ts — under Cache Components it
 * would be removed and this would need `use cache` with cacheLife instead.
 *
 * NEITHER CLIENT READS COOKIES. Reading cookies opts a route out of static
 * rendering entirely, `revalidate` would be silently ignored, and every ad
 * click would hit the database. The anon client is cookie-free by
 * construction; createAdminSupabaseClient reads environment variables only.
 */
export const revalidate = 300;

export default async function GiveawayPage() {
  // Rules 3(a) trigger. Public data — active listings are world-readable under
  // RLS — so the anon key is enough and the service role is not spent on it.
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { count: activeListings } = await anon
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  const closed = (activeListings ?? 0) >= GIVEAWAY_GOAL;

  // The entry pool. A missing service role key is not a crash: loadEntryPool
  // is skipped, entries stays null, and the page renders a headline with no
  // number in it. The alternative — falling back to zero — would state
  // "nobody has entered yet" on the strength of a configuration problem.
  const admin = createAdminSupabaseClient();
  const pool = admin ? await loadEntryPool(admin) : null;

  return <GiveawayLanding entries={pool?.entries ?? null} closed={closed} />;
}
