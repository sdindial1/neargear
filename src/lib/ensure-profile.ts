import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * Make sure a public.users row exists for the auth user before any
 * insert that has an FK to public.users.id. Some legacy auth users
 * never got their profile row provisioned by the trigger, so the
 * meetups/listings inserts blow up on the FK.
 */
export async function ensurePublicUserRow(
  supabase: SupabaseClient,
  user: User,
): Promise<void> {
  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (existing) return;

  const meta = (user.user_metadata ?? {}) as {
    full_name?: string;
    city?: string;
    zipcode?: string;
  };

  await supabase.from("users").insert({
    id: user.id,
    email: user.email,
    full_name: meta.full_name ?? user.email ?? null,
    city: meta.city ?? null,
    zipcode: meta.zipcode ?? null,
  });
}
