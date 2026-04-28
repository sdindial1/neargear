import * as Sentry from "@sentry/nextjs";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { notifyWishlistReactivation } from "@/lib/notifications";
import { calculatePlatformFee } from "@/lib/fees";

const STALE_HOURS = 48;
const COMPLETION_STALE_HOURS = 24;

function checkCronAuth(request: Request): Response | null {
  if (process.env.NODE_ENV !== "production") return null;
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET not configured in production");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

async function runExpiry() {
  try {
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

    if (!m.listing_id) continue;

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

  // ---- 24hr auto-complete pass --------------------------------------------
  const completionCutoffIso = new Date(
    Date.now() - COMPLETION_STALE_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const { data: stuck, error: stuckErr } = await supabase
    .from("meetups")
    .select(
      "id, listing_id, buyer_id, seller_id, offered_price, status, buyer_completed_at, seller_completed_at, listing:listings!listing_id(retail_price)",
    )
    .in("status", ["buyer_confirmed", "seller_confirmed"]);

  let autoCompleted = 0;
  if (!stuckErr && stuck) {
    for (const m of stuck) {
      const ts =
        m.status === "buyer_confirmed"
          ? m.buyer_completed_at
          : m.seller_completed_at;
      if (!ts) continue;
      if (new Date(ts).toISOString() > completionCutoffIso) continue;

      const fee = calculatePlatformFee(m.offered_price ?? 0);
      const nowIso = new Date().toISOString();

      await supabase
        .from("meetups")
        .update({
          status: "completed",
          completed_at: nowIso,
          auto_completed: true,
        })
        .eq("id", m.id);

      if (m.listing_id) {
        await supabase
          .from("listings")
          .update({ status: "sold" })
          .eq("id", m.listing_id);
      }

      const retail = (
        m as unknown as { listing?: { retail_price: number | null } }
      ).listing?.retail_price;

      await supabase.from("transactions").insert({
        meetup_id: m.id,
        listing_id: m.listing_id,
        buyer_id: m.buyer_id,
        seller_id: m.seller_id,
        gross_amount: m.offered_price ?? 0,
        platform_fee: fee,
        net_amount: (m.offered_price ?? 0) - fee,
        retail_price: retail ?? null,
        auto_completed: true,
      });

      console.log(
        `[auto-complete] meetup ${m.id} auto-completed from ${m.status}`,
      );
      autoCompleted++;
    }
  }

  return Response.json({
    ok: true,
    expired: expired.length,
    notified: notifiedTotal,
    autoCompleted,
    cutoff: cutoffIso,
    completionCutoff: completionCutoffIso,
  });
  } catch (err) {
    console.error("[cron] expire-requests error", err);
    Sentry.captureException(err);
    return Response.json(
      { error: "Something went wrong" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const unauthorized = checkCronAuth(request);
  if (unauthorized) return unauthorized;
  return runExpiry();
}

export async function GET(request: Request) {
  const unauthorized = checkCronAuth(request);
  if (unauthorized) return unauthorized;
  return runExpiry();
}
