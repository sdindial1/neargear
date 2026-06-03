import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { isAdmin } from "@/lib/admin";

type GuardResult =
  | { ok: true; admin: SupabaseClient; user: User }
  | { ok: false; response: Response };

/**
 * Shared admin gate for API routes: verifies the caller is a signed-in admin
 * and returns a service-role client (which bypasses RLS). Mirrors the inline
 * pattern used by the existing admin routes, deduped for the partner routes.
 */
export async function requireAdmin(): Promise<GuardResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdmin(user.email)) {
    return {
      ok: false,
      response: Response.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  const admin = createAdminSupabaseClient();
  if (!admin) {
    return {
      ok: false,
      response: Response.json(
        { error: "Service role not configured" },
        { status: 500 },
      ),
    };
  }

  return { ok: true, admin, user };
}
