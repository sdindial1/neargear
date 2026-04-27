import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Best-effort wishlist reactivation logging.
 * Real notification delivery (Twilio + Resend) lands in Session 5.
 */
export async function notifyWishlistReactivation(
  supabase: SupabaseClient,
  listingId: string,
  listingTitle: string,
): Promise<number> {
  const { data: savers } = await supabase
    .from("saved_listings")
    .select("user_id")
    .eq("listing_id", listingId);

  const count = savers?.length ?? 0;
  for (const s of savers ?? []) {
    console.log(
      `[wishlist-notify] Would notify ${s.user_id} that "${listingTitle}" is available again`,
    );
  }
  return count;
}

export function logCounterPartyNotification(
  recipientUserId: string | null,
  message: string,
): void {
  if (!recipientUserId) return;
  console.log(`[notify] ${recipientUserId}: ${message}`);
}
