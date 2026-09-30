import type { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import {
  GIVEAWAY_EVENTS,
  REJECTION_REASONS,
  type GiveawayEvent,
  type RejectionReason,
} from "@/lib/giveaway-events";

export const runtime = "nodejs";

/**
 * POST /api/giveaway/event — record one step of the giveaway funnel.
 *
 * Sibling of /api/pageview and deliberately the same shape: unauthenticated,
 * allow-listed server-side, never throws upward, never able to affect what a
 * paying visitor sees on the page.
 *
 * SERVER-SIDE ALLOWLISTS. The client has them too, but a client-side allowlist
 * is a suggestion — anything can POST here. These are what actually bound the
 * `event` and `reason` columns to values /admin knows how to read.
 *
 * THREE FIELDS ARE READ AND THREE ARE WRITTEN. The body is picked apart field
 * by field rather than spread into the insert, so a caller that starts sending
 * an email address gets it dropped here. Since migration 037 the table has no
 * column that could hold one either — the guarantee is in the schema, and this
 * is the second lock on the same door.
 *
 * NO SESSION LOOKUP. The previous version called getUser() to attach a user_id.
 * That column is gone: this table records that something happened, never who
 * did it. Dropping the lookup also takes a cookie read and a round trip off
 * every event on a page under ad load.
 */

/** Long enough for a UUID, short enough not to be a text dump. */
const MAX = 100;

function clip(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, MAX);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const event = clip(body.event);
    if (!event || !GIVEAWAY_EVENTS.includes(event as GiveawayEvent)) {
      // Not an error worth surfacing — just refuse to record it.
      return Response.json({ ok: false, reason: "event_not_logged" });
    }

    // A reason is meaningful only on a rejection. Anything unrecognised is
    // stored as null rather than passed through, so the column cannot become a
    // free-text field by accident.
    const rawReason = clip(body.reason);
    const reason =
      event === "entry_rejected" &&
      rawReason &&
      REJECTION_REASONS.includes(rawReason as RejectionReason)
        ? rawReason
        : null;

    const admin = createAdminSupabaseClient();
    if (!admin) return Response.json({ ok: false, reason: "no_service_role" });

    const { error } = await admin.from("giveaway_events").insert({
      event,
      session_id: clip(body.session_id),
      reason,
    });

    if (error) {
      console.error("[giveaway/event] insert failed", error);
      return Response.json({ ok: false }, { status: 500 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[giveaway/event] unexpected", err);
    return Response.json({ ok: false }, { status: 500 });
  }
}
