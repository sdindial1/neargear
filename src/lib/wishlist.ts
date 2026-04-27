import type { SupabaseClient } from "@supabase/supabase-js";

const KEY = "neargear:wishlist";

function readLocal(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function writeLocal(set: Set<string>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(Array.from(set)));
}

export function isSavedLocal(listingId: string): boolean {
  return readLocal().has(listingId);
}

export function toggleSavedLocal(listingId: string): boolean {
  const set = readLocal();
  const next = !set.has(listingId);
  if (next) set.add(listingId);
  else set.delete(listingId);
  writeLocal(set);
  return next;
}

export async function getSavedState(
  supabase: SupabaseClient,
  listingId: string,
): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return isSavedLocal(listingId);

  const { data } = await supabase
    .from("saved_listings")
    .select("listing_id")
    .eq("user_id", user.id)
    .eq("listing_id", listingId)
    .maybeSingle();

  return !!data;
}

export async function toggleSaved(
  supabase: SupabaseClient,
  listingId: string,
): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return toggleSavedLocal(listingId);

  const currentlySaved = await getSavedState(supabase, listingId);
  if (currentlySaved) {
    await supabase
      .from("saved_listings")
      .delete()
      .eq("user_id", user.id)
      .eq("listing_id", listingId);
    return false;
  }
  await supabase
    .from("saved_listings")
    .insert({ user_id: user.id, listing_id: listingId });
  return true;
}
