import type { SupabaseClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { notifyWishlistReactivation } from "@/lib/notifications";
import { sendMeetupReminderSMS } from "@/lib/notifications/sms";
import { createNotification } from "@/lib/notifications/inapp";
import { releaseOrder, MAX_TRANSFER_ATTEMPTS } from "@/lib/orders/release";
import type { ReleaseReason } from "@/types/database";

const STALE_HOURS = 48;
const REMINDER_LEAD_MINUTES = 150; // ~2.5h
const REMINDER_LOWER_MINUTES = 90; // ~1.5h floor so jobs running every 30m are covered

// Release ladder timings (payments Phase 3).
const BUYER_CONFIRM_WINDOW_MS = 24 * 60 * 60 * 1000; // rung 2
const BACKSTOP_MS = 7 * 24 * 60 * 60 * 1000; // rung 3
/** Cap per run so a backlog can't turn one invocation into an unbounded job. */
const RELEASE_BATCH_LIMIT = 200;

interface SweepCandidate {
  id: string;
  meetup_id: string | null;
  buyer_confirmed_at: string | null;
  seller_confirmed_at: string | null;
  buyer_notified_at: string | null;
  transfer_attempts: number;
  item_price_cents: number;
  seller_fee_cents: number;
  meetup: { status: string; meetup_window_start: string | null } | null;
}

/** One line of a dry-run preview: what a real run would have done. */
interface ReleasePreviewRow {
  orderId: string;
  meetupId: string | null;
  reason: ReleaseReason;
  payoutCents: number;
  transferAttempts: number;
}

/**
 * Meetup states in which an unattended release is legitimate.
 *
 * 'scheduled' is the live handoff; 'completed' covers a retry after the ledger
 * projection already ran. Everything else — cancelled_*, no_show_*,
 * item_dispute, disputed — means the handoff did NOT happen cleanly, and the
 * timer must not hand the money to the seller.
 *
 * Without this, rung 3 would pay out 7 days after a meetup the buyer had
 * already reported as a seller no-show, because a no-show sets the meetup
 * status but leaves the order untouched. Step 6 wires those events to stamp
 * orders.disputed_at so they freeze explicitly; this is the backstop that
 * makes the sweep safe regardless.
 */
const RELEASABLE_MEETUP_STATUSES = new Set(["scheduled", "completed"]);

/**
 * Which rung of the ladder makes this order releasable right now, if any?
 *
 * Checked in ladder order, and every comparison is ">= elapsed", never "==".
 * That is what makes a DAILY cron safe: an order that becomes eligible one
 * minute after a sweep simply waits for the next one. Rung 2 lands in 24-48h
 * and rung 3 in 7-8 days, always erring toward the seller waiting slightly
 * longer, never toward paying early.
 *
 * Retries need no special case. A failed release returns the order to
 * 'paid_held' with its confirmation stamps intact, so the same predicate that
 * first qualified it still qualifies it on the next run.
 */
function classifyRung(o: SweepCandidate, nowMs: number): ReleaseReason | null {
  // The handoff must not have gone sideways. Cancelled, no-showed and disputed
  // meetups are never released by a timer.
  if (!o.meetup || !RELEASABLE_MEETUP_STATUSES.has(o.meetup.status)) return null;

  // Rung 1 — the buyer confirmed. Reaching the sweep means the inline release
  // in confirm-receipt failed (or never ran), so this is the retry path.
  if (o.buyer_confirmed_at) return "buyer_confirmed";

  // Rung 2 — seller confirmed and the buyer's 24h window has elapsed. Keyed on
  // buyer_notified_at, not seller_confirmed_at: the clock starts when we told
  // the buyer, so a notification we never sent can't start it.
  if (o.seller_confirmed_at && o.buyer_notified_at) {
    if (nowMs - Date.parse(o.buyer_notified_at) >= BUYER_CONFIRM_WINDOW_MS) {
      return "seller_24h";
    }
  }

  // Rung 3 — nobody confirmed; 7d from the scheduled meetup window.
  const windowStart = o.meetup?.meetup_window_start;
  if (windowStart && nowMs - Date.parse(windowStart) >= BACKSTOP_MS) {
    return "backstop_7d";
  }

  return null;
}

/**
 * Release every order that has reached a rung of the ladder.
 *
 * Disputed orders and orders past the retry cap are excluded in the query, so
 * a frozen order is never even considered. Everything else defers to
 * releaseOrder(), which owns the CAS claim, the Stripe call and the ledger
 * projection — this function only decides WHO is eligible, never how much.
 */
async function runReleaseSweep(admin: SupabaseClient, dry: boolean) {
  const nowMs = Date.now();

  const { data, error } = await admin
    .from("orders")
    .select(
      "id, meetup_id, buyer_confirmed_at, seller_confirmed_at, buyer_notified_at, " +
        "transfer_attempts, item_price_cents, seller_fee_cents, " +
        "meetup:meetups!meetup_id(status, meetup_window_start)",
    )
    .eq("status", "paid_held")
    .is("disputed_at", null)
    .lt("transfer_attempts", MAX_TRANSFER_ATTEMPTS)
    .limit(RELEASE_BATCH_LIMIT + 1);

  if (error) {
    console.error("[release-sweep] candidate fetch failed:", error);
    Sentry.captureException(error);
    return {
      released: 0,
      failed: 0,
      skipped: 0,
      eligible: 0,
      truncated: false,
      preview: [] as ReleasePreviewRow[],
    };
  }

  type JoinedMeetup = { status: string; meetup_window_start: string | null };
  const rows = (data ?? []) as unknown as Array<
    Omit<SweepCandidate, "meetup"> & {
      meetup: JoinedMeetup[] | JoinedMeetup | null;
    }
  >;

  // Never silently truncate: say so if a backlog spills to the next run.
  const truncated = rows.length > RELEASE_BATCH_LIMIT;
  if (truncated) {
    console.warn(
      `[release-sweep] more than ${RELEASE_BATCH_LIMIT} candidates; processing ${RELEASE_BATCH_LIMIT}, remainder next run`,
    );
  }

  let released = 0;
  let failed = 0;
  let skipped = 0;
  let eligible = 0;
  const byReason: Record<string, number> = {};
  const preview: ReleasePreviewRow[] = [];

  for (const row of rows.slice(0, RELEASE_BATCH_LIMIT)) {
    const candidate: SweepCandidate = {
      ...row,
      meetup: Array.isArray(row.meetup) ? (row.meetup[0] ?? null) : row.meetup,
    };

    const reason = classifyRung(candidate, nowMs);
    if (!reason) continue; // not yet at a rung — leave it alone
    eligible++;

    if (dry) {
      // PREVIEW ONLY. Nothing below this line runs: no CAS claim, no Stripe
      // call, no row written. The candidate query above is a plain SELECT, so a
      // dry run is read-only end to end and safe against production.
      byReason[reason] = (byReason[reason] ?? 0) + 1;
      preview.push({
        orderId: candidate.id,
        meetupId: candidate.meetup_id,
        reason,
        payoutCents: candidate.item_price_cents - candidate.seller_fee_cents,
        transferAttempts: candidate.transfer_attempts,
      });
      continue;
    }

    const result = await releaseOrder(admin, candidate.id, reason);
    if (result.outcome === "released") {
      released++;
      byReason[reason] = (byReason[reason] ?? 0) + 1;
    } else if (result.outcome === "failed") {
      failed++;
    } else {
      skipped++;
    }
  }

  console.log(
    dry
      ? `[release-sweep:DRY] eligible=${eligible} (no writes, no transfers)`
      : `[release-sweep] eligible=${eligible} released=${released} failed=${failed} skipped=${skipped}`,
  );
  return { released, failed, skipped, eligible, truncated, byReason, preview };
}

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

/**
 * @param dry Preview mode. Every pass still runs its SELECTs so it can report
 *   what WOULD happen, but no write, notification, SMS or Stripe call is made.
 *   This is what makes it safe to dry-run the live cron in production.
 */
async function runExpiry(dry: boolean) {
  try {
  // Service-role: this job runs with no user session, and since Phase 3 it
  // writes orders. Previously it used the session client, which under RLS as an
  // anonymous caller could silently no-op some of its writes.
  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    console.error("[cron] service role not configured");
    return Response.json({ error: "Service role not configured" }, { status: 500 });
  }

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
  for (const m of dry ? [] : expired) {
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

  // ---- Release sweep (payments Phase 3, rungs 2 and 3) --------------------
  //
  // Replaces the old 24h auto-complete pass, which computed a tiered platform
  // fee here and inserted the ledger row itself. That made the cron a second,
  // independent completion writer racing the browser, with its own idea of the
  // fee. Completion is now a downstream projection of releaseOrder(), and this
  // pass only decides which orders have reached a rung.
  const release = await runReleaseSweep(supabase, dry);

  // ---- 2-hour SMS reminder pass ------------------------------------------
  const now = Date.now();
  const reminderLowerIso = new Date(
    now + REMINDER_LOWER_MINUTES * 60 * 1000,
  ).toISOString();
  const reminderUpperIso = new Date(
    now + REMINDER_LEAD_MINUTES * 60 * 1000,
  ).toISOString();

  let remindersSent = 0;
  const { data: upcoming, error: upcomingErr } = await supabase
    .from("meetups")
    .select(
      `id, meetup_window_start, meetup_location, reminder_sent,
       buyer:users!buyer_id(phone, id),
       seller:users!seller_id(phone, id),
       listing:listings!listing_id(title)`,
    )
    .eq("status", "scheduled")
    .eq("reminder_sent", false)
    .gte("meetup_window_start", reminderLowerIso)
    .lte("meetup_window_start", reminderUpperIso);

  if (!upcomingErr && upcoming && !dry) {
    for (const m of upcoming) {
      const row = m as unknown as {
        id: string;
        meetup_location: string | null;
        buyer: { id: string; phone: string | null } | null;
        seller: { id: string; phone: string | null } | null;
        listing: { title: string } | null;
      };
      let zoneName = "your meetup spot";
      let zoneAddress = "Address shared in app";
      if (row.meetup_location) {
        try {
          const parsed = JSON.parse(row.meetup_location) as {
            name?: string;
            address?: string;
          };
          zoneName = parsed.name || zoneName;
          zoneAddress = parsed.address || zoneAddress;
        } catch {}
      }
      const title = row.listing?.title || "your meetup";

      try {
        await Promise.all([
          sendMeetupReminderSMS({
            toPhone: row.buyer?.phone ?? null,
            listingTitle: title,
            zoneName,
            zoneAddress,
          }),
          sendMeetupReminderSMS({
            toPhone: row.seller?.phone ?? null,
            listingTitle: title,
            zoneName,
            zoneAddress,
          }),
          createNotification({
            userId: row.buyer?.id ?? null,
            type: "meetup_reminder",
            title: "Meetup in ~2 hours",
            body: `Your meetup for ${title} starts soon at ${zoneName}.`,
            link: `/meetups/${row.id}/messages`,
          }),
          createNotification({
            userId: row.seller?.id ?? null,
            type: "meetup_reminder",
            title: "Meetup in ~2 hours",
            body: `Your meetup for ${title} starts soon at ${zoneName}.`,
            link: `/meetups/${row.id}/messages`,
          }),
        ]);

        await supabase
          .from("meetups")
          .update({ reminder_sent: true })
          .eq("id", row.id);
        remindersSent++;
      } catch (err) {
        console.error(`[reminder] meetup ${row.id} failed:`, err);
      }
    }
  }

  // ---- No-show prompt pass --------------------------------------------
  // Meetups whose window ended >1h ago, still scheduled, and we haven't
  // pinged the parties yet → ask both "did your meetup happen?".
  const noShowCutoffIso = new Date(
    Date.now() - 60 * 60 * 1000,
  ).toISOString();
  let noShowPromptsSent = 0;

  const { data: pendingNoShows } = await supabase
    .from("meetups")
    .select(
      `id, buyer_id, seller_id, listing:listings!listing_id(title)`,
    )
    .eq("status", "scheduled")
    .is("no_show_prompt_sent_at", null)
    .lte("meetup_window_end", noShowCutoffIso);

  for (const row of dry ? [] : (pendingNoShows ?? [])) {
    const r = row as unknown as {
      id: string;
      buyer_id: string | null;
      seller_id: string | null;
      listing: { title: string } | null;
    };
    const title = r.listing?.title ?? "your meetup";
    try {
      await Promise.all([
        createNotification({
          userId: r.buyer_id,
          type: "no_show_prompt",
          title: "Did your meetup happen?",
          body: `Let us know what happened with ${title}.`,
          link: `/meetups/${r.id}/no-show`,
        }),
        createNotification({
          userId: r.seller_id,
          type: "no_show_prompt",
          title: "Did your meetup happen?",
          body: `Let us know what happened with ${title}.`,
          link: `/meetups/${r.id}/no-show`,
        }),
      ]);
      await supabase
        .from("meetups")
        .update({ no_show_prompt_sent_at: new Date().toISOString() })
        .eq("id", r.id);
      noShowPromptsSent++;
    } catch (err) {
      console.error(`[no-show prompt] meetup ${r.id} failed:`, err);
    }
  }

  // Dry runs report in "would" language and use distinct field names, so no
  // field ever means two different things depending on mode.
  if (dry) {
    return Response.json({
      ok: true,
      dry: true,
      cutoff: cutoffIso,
      wouldExpire: expired.length,
      wouldRemind: upcoming?.length ?? 0,
      wouldPromptNoShow: pendingNoShows?.length ?? 0,
      releaseEligible: release.eligible,
      releaseByReason: release.byReason ?? {},
      releasePreview: release.preview,
      releaseTruncated: release.truncated,
    });
  }

  return Response.json({
    ok: true,
    dry: false,
    expired: expired.length,
    notified: notifiedTotal,
    remindersSent,
    noShowPromptsSent,
    cutoff: cutoffIso,
    // Payments Phase 3 — money moved on this run.
    released: release.released,
    releaseFailed: release.failed,
    releaseSkipped: release.skipped,
    releaseEligible: release.eligible,
    releaseByReason: release.byReason ?? {},
    releaseTruncated: release.truncated,
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

/**
 * ?dry=1 (or ?dry=true) previews without touching anything. Unknown values are
 * treated as NOT dry — an unrecognised flag must never silently disable a real
 * scheduled run.
 */
function isDryRun(request: Request): boolean {
  const v = new URL(request.url).searchParams.get("dry");
  return v === "1" || v === "true";
}

export async function POST(request: Request) {
  const unauthorized = checkCronAuth(request);
  if (unauthorized) return unauthorized;
  return runExpiry(isDryRun(request));
}

export async function GET(request: Request) {
  const unauthorized = checkCronAuth(request);
  if (unauthorized) return unauthorized;
  return runExpiry(isDryRun(request));
}
