import * as Sentry from "@sentry/nextjs";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const SAFE_ZONES = 30;

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();

    const [{ count: activeListings }, { data: founding }] = await Promise.all([
      supabase
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      supabase
        .from("founding_spots")
        .select("spots_claimed, total_spots")
        .eq("id", 1)
        .maybeSingle(),
    ]);

    return Response.json(
      {
        activeListings: activeListings ?? 0,
        safeZones: SAFE_ZONES,
        foundingTotal: founding?.total_spots ?? 15,
        foundingClaimed: founding?.spots_claimed ?? 0,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (err) {
    console.error("[stats] error", err);
    Sentry.captureException(err);
    return Response.json(
      { activeListings: 0, safeZones: SAFE_ZONES, foundingTotal: 15, foundingClaimed: 0 },
      { status: 200 },
    );
  }
}
