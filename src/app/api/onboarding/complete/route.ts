import * as Sentry from "@sentry/nextjs";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

/**
 * POST /api/onboarding/complete
 *
 * Marks the first-run experience as seen. Server-side so it doesn't replay
 * when the same person opens the site on another device — the whole reason
 * this isn't localStorage.
 *
 * Idempotent, and deliberately only ever stamps the FIRST completion: the
 * conditional `is null` means a second call can't overwrite the original
 * timestamp, which keeps the column useful for measuring signup-to-first-
 * listing later.
 */
export async function POST() {
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
      return Response.json(
        { error: "Service role not configured" },
        { status: 500 },
      );
    }

    const { error } = await admin
      .from("users")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", user.id)
      .is("onboarding_completed_at", null);

    if (error) {
      console.error("[onboarding/complete] update failed", error);
      Sentry.captureException(error);
      return Response.json({ error: "update_failed" }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[onboarding/complete] error", err);
    Sentry.captureException(err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
