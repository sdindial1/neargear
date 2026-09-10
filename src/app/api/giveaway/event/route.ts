import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { GIVEAWAY_EVENTS, type GiveawayEvent } from "@/lib/giveaway-events";

export const runtime = "nodejs";

/**
 * POST /api/giveaway/event - record one step of the giveaway funnel.
 *
 * Sibling of /api/pageview and deliberately the same shape: unauthenticated,
 * allow-listed server-side, never throws upward, never able to affect what a
 * paying visitor sees on the page.
 *
 * SERVER-SIDE ALLOWLIST. The client has one too, but a client-side allowlist is
 * a suggestion - anything can POST here. This is what actually bounds the
 * `event` column to the three values /admin knows how to read.
 *
 * NO PERSONAL DATA IS ACCEPTED. The body is read field by field rather than
 * spread into the insert, so a future caller that starts sending an email
 * address gets it dropped here instead of quietly persisting it into a table
 * whose whole premise is that it holds none.
 */

/** Long enough for real campaign values, short enough not to be a text dump. */
const MAX = 300;

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
      // Not an error worth surfacing - just refuse to record it.
      return Response.json({ ok: false, reason: "event_not_logged" });
    }

    const admin = createAdminSupabaseClient();
    if (!admin) return Response.json({ ok: false, reason: "no_service_role" });

    // Best effort. An anonymous visitor is the expected case for every event
    // except signup_completed, and getUser() returning nothing is not a failure.
    let userId: string | null = null;
    try {
      const supabase = await createServerSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      // ignore
    }

    const { error } = await admin.from("giveaway_events").insert({
      event,
      session_id: clip(body.session_id),
      utm_source: clip(body.utm_source),
      utm_medium: clip(body.utm_medium),
      utm_campaign: clip(body.utm_campaign),
      fbclid: clip(body.fbclid),
      user_id: userId,
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
