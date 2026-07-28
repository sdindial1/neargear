import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared meetup lifecycle mutations used by both the "My Meetups" incoming
 * list (profile/meetups) and the meetup detail page seller actions, so the two
 * surfaces stay in sync. These perform the DB writes only — callers fire their
 * own notifications and manage UI state, matching the original inline logic.
 */

/** requested/countered -> scheduled (this is what unlocks buyer payment). */
export function acceptMeetup(supabase: SupabaseClient, meetupId: string) {
  return supabase
    .from("meetups")
    .update({ status: "scheduled" })
    .eq("id", meetupId);
}

/** Seller declines: cancel the meetup and put the listing back on the market. */
export async function declineMeetup(
  supabase: SupabaseClient,
  meetupId: string,
  listingId: string | null | undefined,
) {
  const result = await supabase
    .from("meetups")
    .update({ status: "cancelled_seller" })
    .eq("id", meetupId);
  if (listingId) {
    await supabase
      .from("listings")
      .update({ status: "active" })
      .eq("id", listingId);
  }
  return result;
}
