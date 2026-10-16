import {
  fetchRemoveBgCredits,
  LOW_CREDIT_THRESHOLD,
} from "@/lib/remove-bg";
import { alertOperational } from "@/lib/notifications/alert";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/cron/removebg-credits
 *
 * Watches the remove.bg balance so we find out we are nearly out BEFORE a
 * seller does.
 *
 * WHY IT EXISTS. On 2026-10-15 the account hit zero. Every call after that
 * returned 402, the sell flow quietly uploaded the original photos, and nothing
 * said a word — the gap between the failure and anyone noticing was two weeks.
 * The route-level alert now catches the moment it breaks; this catches it a day
 * or two EARLIER, while there is still runway to top up.
 *
 * DAILY CRON. Hobby runs each job at most once per day with up to ~59 minutes
 * of slack (see POST-LAUNCH.md), so this is a trailing indicator by design: it
 * is the early warning, not the safety net. The safety net is the alert on the
 * removal route itself.
 *
 * `?dry=1` runs the check and reports the numbers without alerting, so the
 * route can be exercised without sending mail — same convention as the
 * expire-requests and listing-nudges crons.
 */

function checkCronAuth(request: Request): Response | null {
  if (process.env.NODE_ENV !== "production") return null;
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron:removebg] CRON_SECRET not configured in production");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(request: Request) {
  const unauthorized = checkCronAuth(request);
  if (unauthorized) return unauthorized;

  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const credits = await fetchRemoveBgCredits();

  // null is UNKNOWN, never zero. In production an unreadable balance is itself
  // a problem worth an email: it means the key is missing, rejected, or
  // remove.bg is unreachable, and the next seller is about to find out.
  if (!credits) {
    const summary =
      "Could not read the remove.bg credit balance — the key may be missing or rejected, or remove.bg may be unreachable. Background removal is probably already failing.";
    if (!dry && process.env.NODE_ENV === "production") {
      await alertOperational({
        event: "removebg_balance_unreadable",
        summary,
        details: { configured: Boolean(process.env.REMOVEBG_API_KEY) },
      });
    }
    return Response.json({ ok: false, status: "unknown", dry, summary });
  }

  const { total } = credits;
  const status =
    total <= 0 ? "exhausted" : total < LOW_CREDIT_THRESHOLD ? "low" : "ok";

  if (status !== "ok" && !dry) {
    await alertOperational({
      event: `removebg_credits_${status}`,
      summary:
        status === "exhausted"
          ? "remove.bg has NO credits left. Listing photos are uploading with their backgrounds intact right now. Top up to restore background removal."
          : `remove.bg is down to ${total} credits (warn below ${LOW_CREDIT_THRESHOLD}). That is under three full listings of runway — top up before a seller hits it.`,
      details: {
        total,
        subscription: credits.subscription,
        payg: credits.payg,
        enterprise: credits.enterprise,
        threshold: LOW_CREDIT_THRESHOLD,
      },
    });
  }

  console.log(
    `[cron:removebg] credits=${total} status=${status}${dry ? " (dry)" : ""}`,
  );

  return Response.json({
    ok: true,
    status,
    dry,
    credits: {
      total,
      subscription: credits.subscription,
      payg: credits.payg,
      enterprise: credits.enterprise,
      // Reported for the record only — see RemoveBgCredits.freeCalls for why
      // this number cannot be trusted as "calls available".
      freeCalls: credits.freeCalls,
    },
    threshold: LOW_CREDIT_THRESHOLD,
  });
}
