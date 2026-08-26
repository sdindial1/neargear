import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { sendListingNudge } from "@/lib/notifications/email";
import {
  NUDGE_SCHEDULE,
  promotionOpen,
  type NudgeStep,
} from "@/lib/notifications/listing-nudge";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/listing-nudges
 *
 * Nudges accounts with zero listings toward a first listing. Three emails, then
 * silence forever.
 *
 * OFF BY DEFAULT. Sending requires LISTING_NUDGES_ENABLED=true. This is gated
 * on the deliverability check (SPF/DKIM/DMARC green plus confirmed inbox
 * placement on Gmail, Outlook and Yahoo) because a nudge that lands in junk
 * trains the filter against the domain — including the transactional receipts
 * that actually matter. Until the flag is set, the route runs end to end and
 * records 'suppressed' rows so the selection logic is observable without a
 * single message going out.
 *
 * ?dry=1 previews without writing anything at all, matching the convention in
 * the expire-requests cron.
 *
 * DAILY CRON (Vercel Hobby), so every comparison is elapsed-time `>=`. A nudge
 * fires late, never early — the same discipline as the release ladder.
 */

const BATCH_LIMIT = 200;

interface Candidate {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  unsubscribe_token: string;
}

function checkCronAuth(request: Request): Response | null {
  if (process.env.NODE_ENV !== "production") return null;
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron:nudge] CRON_SECRET not configured in production");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/**
 * Eligible users for one step.
 *
 * CANCELLATION LIVES HERE AND NOWHERE ELSE. There is no "cancel the remaining
 * sends" write when someone lists — creating a listing removes them from this
 * result set by construction. A separate cancellation write would be one more
 * thing that can silently fail, and a cancel that reports success while doing
 * nothing is the exact bug shape this codebase keeps producing. Nothing to fail
 * beats something that claims it worked.
 */
async function eligibleFor(
  admin: SupabaseClient,
  step: NudgeStep,
): Promise<Candidate[]> {
  const cutoff = new Date(
    Date.now() - NUDGE_SCHEDULE[step] * 60 * 60 * 1000,
  ).toISOString();

  const { data: users, error } = await admin
    .from("users")
    .select("id, email, full_name, created_at, unsubscribe_token")
    .lte("created_at", cutoff)
    .is("nudge_unsubscribed_at", null)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT * 4);
  if (error) throw new Error(`users query: ${error.message}`);
  if (!users?.length) return [];

  const ids = users.map((u) => u.id);

  // Zero listings of ANY status. Someone who listed and then removed it has
  // still done the thing we were asking for; nudging them would read as not
  // paying attention.
  const { data: withListings, error: lErr } = await admin
    .from("listings")
    .select("seller_id")
    .in("seller_id", ids);
  if (lErr) throw new Error(`listings query: ${lErr.message}`);
  const listed = new Set((withListings ?? []).map((l) => l.seller_id));

  // Already handled this step. Includes 'failed' — a bad address is not retried
  // forever — and 'skipped', which is a deliberate permanent decision. Excludes
  // 'suppressed', which never actually sent and must still go out once the flag
  // is on. This list must stay identical to the partial unique index predicate
  // in migration 032; if they drift, the index rejects a send the query thought
  // was due.
  const { data: already, error: nErr } = await admin
    .from("listing_nudges")
    .select("user_id, step, status")
    .in("user_id", ids)
    .in("status", ["sent", "failed", "skipped"]);
  if (nErr) throw new Error(`nudges query: ${nErr.message}`);
  const done = new Set(
    (already ?? []).map((n) => `${n.user_id}:${n.step}`),
  );

  return (users as Candidate[])
    .filter((u) => !listed.has(u.id))
    .filter((u) => !done.has(`${u.id}:${step}`))
    .slice(0, BATCH_LIMIT);
}

export async function GET(request: Request) {
  const unauthorized = checkCronAuth(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const dry = url.searchParams.get("dry") === "1";
  const enabled = process.env.LISTING_NUDGES_ENABLED === "true";

  const admin = createAdminSupabaseClient();
  if (!admin) {
    return Response.json({ error: "Service role not configured" }, { status: 500 });
  }

  try {
    // Rules 3(a): the Promotion also ends the moment the platform reaches
    // GIVEAWAY_GOAL active listings. Read it rather than assuming it is open —
    // promoting a closed drawing would be a false statement in a marketing
    // email.
    const { count: activeListings } = await admin
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("status", "active");
    const open = promotionOpen(activeListings ?? null);

    // The social-proof line in email 2, read live. Organic only: naming a seed
    // listing would advertise gear that does not exist and a seller nobody can
    // reach. Null when there is nothing suitable, and the sentence is dropped
    // rather than substituted — the previous hardcoded example described a
    // listing that was taken down the same day.
    const { data: exampleRow } = await admin
      .from("listings")
      .select("title, city")
      .eq("status", "active")
      .eq("source", "organic")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const example = exampleRow?.title
      ? { title: exampleRow.title, city: exampleRow.city ?? null }
      : null;

    const summary: Record<string, unknown> = {
      dry,
      enabled,
      promotionOpen: open,
      activeListings: activeListings ?? null,
      example: example ? `${example.title}${example.city ? " / " + example.city : ""}` : null,
      steps: {} as Record<string, unknown>,
    };

    for (const step of [1, 2, 3] as NudgeStep[]) {
      const candidates = await eligibleFor(admin, step);
      const stepResult = {
        eligible: candidates.length,
        sent: 0,
        failed: 0,
        suppressed: 0,
        preview: candidates.slice(0, 10).map((c) => ({
          userId: c.id,
          domain: c.email.split("@")[1] ?? "?",
          signedUp: c.created_at,
        })),
      };

      if (!dry) {
        for (const c of candidates) {
          if (!enabled) {
            // Records the decision without sending. The partial unique index
            // excludes 'suppressed', so the step is not consumed and the real
            // email still goes out once the flag is on.
            await admin.from("listing_nudges").insert({
              user_id: c.id, step, status: "suppressed",
              error: "LISTING_NUDGES_ENABLED is not true",
            });
            stepResult.suppressed++;
            continue;
          }

          const result = await sendListingNudge({
            step,
            to: {
              email: c.email,
              fullName: c.full_name,
              unsubscribeToken: c.unsubscribe_token,
            },
            promotionOpen: open,
            example,
          });

          // Written from the ACTUAL send outcome, not from the fact that the
          // call returned. sendOrLog used to swallow failures and return void.
          const { error: insErr } = await admin.from("listing_nudges").insert({
            user_id: c.id,
            step,
            status: result.ok ? "sent" : "failed",
            provider_id: result.providerId ?? null,
            error: result.ok ? null : (result.message ?? result.reason ?? "unknown"),
          });
          // 23505 = the unique index caught a concurrent run. Not an error.
          if (insErr && !insErr.message.includes("duplicate key")) {
            console.error("[cron:nudge] log insert failed", insErr);
            Sentry.captureException(insErr);
          }
          result.ok ? stepResult.sent++ : stepResult.failed++;
        }
      }

      (summary.steps as Record<string, unknown>)[`step${step}`] = stepResult;
    }

    console.log(`[cron:nudge] ${JSON.stringify(summary)}`);
    return Response.json(summary);
  } catch (err) {
    console.error("[cron:nudge] failed", err);
    Sentry.captureException(err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
