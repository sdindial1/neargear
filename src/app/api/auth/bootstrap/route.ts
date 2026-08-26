import * as Sentry from "@sentry/nextjs";
import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

/**
 * POST /api/auth/bootstrap — attach client-held signup context to an OAuth account.
 *
 * WHY THIS EXISTS. Password signup writes the public.users row in the browser,
 * so it can spread attributionColumns() straight into the insert. The OAuth
 * round trip cannot: /auth/callback is a SERVER route handler with no window
 * and no localStorage, and it is where the account first comes into being.
 *
 * The callback already creates the row and records terms acceptance, so those
 * are durable and do not depend on this call. This route carries only the part
 * that is physically unavailable on the server — the first-touch attribution
 * sitting in the visitor's localStorage from whenever they landed.
 *
 * FIRST WRITE WINS. Every column is written only where the stored value IS
 * NULL, so this can never overwrite attribution captured at password signup and
 * a replayed request cannot rewrite history. That also makes it safe to call on
 * every post-auth landing rather than having to know whether it already ran.
 *
 * Scoped to the caller's own row. The service role bypasses RLS, so the user id
 * comes from the verified session and never from the request body.
 */

const ALLOWED = [
  "attribution_fbclid",
  "attribution_utm_source",
  "attribution_utm_medium",
  "attribution_utm_campaign",
  "attribution_referrer",
  "attribution_landing_path",
  "attribution_captured_at",
] as const;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminSupabaseClient();
    if (!admin) {
      return Response.json({ ok: false, reason: "no_service_role" });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    // Allow-listed, so a caller cannot set arbitrary columns on their own row
    // through a route that holds the service-role key.
    const incoming: Record<string, string> = {};
    for (const key of ALLOWED) {
      const v = body[key];
      if (typeof v === "string" && v.trim()) incoming[key] = v.slice(0, 500);
    }
    if (Object.keys(incoming).length === 0) {
      return Response.json({ ok: true, written: 0, reason: "nothing_to_write" });
    }

    const { data: existingRow, error: readErr } = await admin
      .from("users")
      .select(
        "attribution_fbclid, attribution_utm_source, attribution_utm_medium, " +
          "attribution_utm_campaign, attribution_referrer, " +
          "attribution_landing_path, attribution_captured_at",
      )
      .eq("id", user.id)
      .maybeSingle();
    const existing = existingRow as Record<string, unknown> | null;
    if (readErr) {
      console.error("[auth/bootstrap] read failed", readErr);
      return Response.json({ error: "read_failed" }, { status: 500 });
    }
    if (!existing) {
      // The callback creates the row before redirecting, so this means the
      // caller reached a landing page by some other route. Nothing to patch.
      return Response.json({ ok: false, reason: "no_profile_row" });
    }

    const patch: Record<string, string> = {};
    for (const [k, v] of Object.entries(incoming)) {
      if (existing[k] == null) patch[k] = v;
    }
    if (Object.keys(patch).length === 0) {
      return Response.json({ ok: true, written: 0, reason: "already_set" });
    }

    const { error: updErr } = await admin
      .from("users")
      .update(patch)
      .eq("id", user.id);
    if (updErr) {
      console.error("[auth/bootstrap] update failed", updErr);
      Sentry.captureException(updErr);
      return Response.json({ error: "update_failed" }, { status: 500 });
    }

    return Response.json({ ok: true, written: Object.keys(patch).length });
  } catch (err) {
    console.error("[auth/bootstrap] unexpected", err);
    Sentry.captureException(err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
