import { createServerSupabaseClient } from "@/lib/supabase-server";
import { notifyWishlistReactivation } from "@/lib/notifications";

const STALE_HOURS = 48;

async function runExpiry() {
  const supabase = await createServerSupabaseClient();
  const cutoffIso = new Date(
    Date.now() - STALE_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const { data: stale, error: fetchErr } = await supabase
    .from("meetups")
    .select(
      "id, listing_id, listing:listings!listing_id(id, title)",
    )
    .eq("status", "requested")
    .lt("created_at", cutoffIso);

  if (fetchErr) {
    console.error("[expire-requests] fetch error:", fetchErr);
    return Response.json(
      { ok: false, error: fetchErr.message },
      { status: 500 },
    );
  }

  const expired = stale ?? [];
  console.log(
    `[expire-requests] cutoff=${cutoffIso} candidates=${expired.length}`,
  );

  let notifiedTotal = 0;
  for (const m of expired) {
    const { error: mErr } = await supabase
      .from("meetups")
      .update({ status: "cancelled_auto" })
      .eq("id", m.id);
    if (mErr) {
      console.error(`[expire-requests] meetup ${m.id} update failed:`, mErr);
      continue;
    }

    await supabase
      .from("listings")
      .update({ status: "active" })
      .eq("id", m.listing_id);

    const listing = (m as unknown as { listing?: { title?: string } }).listing;
    notifiedTotal += await notifyWishlistReactivation(
      supabase,
      m.listing_id,
      listing?.title ?? "your saved listing",
    );
  }

  return Response.json({
    ok: true,
    expired: expired.length,
    notified: notifiedTotal,
    cutoff: cutoffIso,
  });
}

export async function POST() {
  return runExpiry();
}

export async function GET() {
  // Allow GET for manual dev triggering. In production this should require
  // a shared-secret header (cron-job.org or Vercel cron passes one).
  return runExpiry();
}
