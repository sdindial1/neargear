import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. ONLY usable from server-side code (API
 * routes, server components, server actions) — never expose this to the
 * browser. Bypasses RLS so the admin dashboard can read every user's data.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local. Without it, returns null
 * so callers can render a "service role key not configured" message instead
 * of crashing the page.
 */
export function createAdminSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
