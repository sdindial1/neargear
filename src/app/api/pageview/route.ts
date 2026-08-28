import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

/**
 * POST /api/pageview — record a view of /giveaway or /sell.
 *
 * Unauthenticated by necessity: the visitors worth counting are the ones who
 * never made an account. The session is read if one happens to exist, purely to
 * attach user_id, and its absence is the normal case.
 *
 * SERVER-SIDE ALLOWLIST. The client component also has one, but a client-side
 * allowlist is a suggestion — anything can POST here. This is what actually
 * bounds the table to the two routes the funnel needs.
 *
 * Always returns 200-ish and never throws upward. This is measurement riding on
 * a page a paying visitor is looking at; it must not be able to affect what they
 * see, and a logging failure is not worth a Sentry page.
 */

const ALLOWED_PATHS = new Set(["/giveaway", "/sell"]);

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

    const path = clip(body.path);
    if (!path || !ALLOWED_PATHS.has(path)) {
      // Not an error worth surfacing — just refuse to record it.
      return Response.json({ ok: false, reason: "path_not_logged" });
    }

    const admin = createAdminSupabaseClient();
    if (!admin) return Response.json({ ok: false, reason: "no_service_role" });

    // Best effort. An anonymous visitor is the expected case and getUser()
    // returning nothing is not a failure.
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

    const { error } = await admin.from("page_views").insert({
      path,
      utm_source: clip(body.utm_source),
      utm_medium: clip(body.utm_medium),
      utm_campaign: clip(body.utm_campaign),
      fbclid: clip(body.fbclid),
      referrer: clip(body.referrer),
      session_id: clip(body.session_id),
      user_id: userId,
    });

    if (error) {
      console.error("[pageview] insert failed", error);
      return Response.json({ ok: false }, { status: 500 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[pageview] unexpected", err);
    return Response.json({ ok: false }, { status: 500 });
  }
}
