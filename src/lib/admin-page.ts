import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { isAdmin } from "@/lib/admin";

/**
 * Admin gate for server pages. Redirects non-admins to "/". Returns a
 * service-role client (bypasses RLS), or null when SUPABASE_SERVICE_ROLE_KEY
 * is unconfigured — callers render <AdminServiceRoleNotice /> in that case.
 */
export async function getAdminClientOrRedirect(): Promise<SupabaseClient | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdmin(user.email)) {
    redirect("/");
  }
  return createAdminSupabaseClient();
}
