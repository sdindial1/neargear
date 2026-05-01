import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotification } from "@/lib/notifications/inapp";

export type StrikeType =
  | "buyer_no_show"
  | "seller_no_show"
  | "item_not_as_described"
  | "late_cancel_buyer"
  | "late_cancel_seller";

export type StrikeIssuer = "buyer" | "seller" | "system" | "admin";

export interface IssueStrikeParams {
  userId: string;
  meetupId: string | null;
  type: StrikeType;
  issuedBy: StrikeIssuer;
  notes?: string | null;
}

export interface IssueStrikeResult {
  newCount: number;
  suspensionEndsAt: string | null;
  suspendedPermanently: boolean;
}

/**
 * Insert a strike row, bump the user's strike_count, apply suspension on
 * the 3rd / 4th / 5th strike. MUST be called with a service-role
 * SupabaseClient — RLS blocks client-side inserts on strikes.
 */
export async function issueStrike(
  admin: SupabaseClient,
  params: IssueStrikeParams,
): Promise<IssueStrikeResult> {
  const { userId, meetupId, type, issuedBy, notes } = params;

  await admin.from("strikes").insert({
    user_id: userId,
    meetup_id: meetupId,
    type,
    issued_by: issuedBy,
    notes: notes ?? null,
  });

  const { data: user } = await admin
    .from("users")
    .select("strike_count")
    .eq("id", userId)
    .single();

  const current = (user?.strike_count as number | null) ?? 0;
  const newCount = current + 1;

  let suspensionEndsAt: string | null = null;
  let suspendedPermanently = false;

  if (newCount >= 5) {
    suspendedPermanently = true;
  } else if (newCount === 4) {
    suspensionEndsAt = new Date(
      Date.now() + 60 * 24 * 60 * 60 * 1000,
    ).toISOString();
  } else if (newCount === 3) {
    suspensionEndsAt = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
  }

  await admin
    .from("users")
    .update({
      strike_count: newCount,
      suspension_ends_at: suspensionEndsAt,
      suspended_permanently: suspendedPermanently,
    })
    .eq("id", userId);

  await createNotification({
    userId,
    type: "strike_issued",
    title: getStrikeTitle(newCount),
    body: getStrikeBody(newCount, type),
    link: "/profile",
  }).catch((err) => {
    console.error("[strikes] notification failed", err);
  });

  return { newCount, suspensionEndsAt, suspendedPermanently };
}

export function getStrikeTitle(count: number): string {
  if (count >= 5) {
    return "Your selling access has been permanently removed";
  }
  if (count === 4) {
    return "Your selling access is suspended for 60 days";
  }
  if (count === 3) {
    return "Your selling access is suspended for 30 days";
  }
  return `Strike warning (${count} of 5)`;
}

export function getStrikeBody(count: number, type: StrikeType): string {
  const reasonMap: Record<StrikeType, string> = {
    buyer_no_show: "reported no-show as a buyer",
    seller_no_show: "reported no-show as a seller",
    item_not_as_described: "an item was reported as not as described",
    late_cancel_buyer: "late cancellation as buyer",
    late_cancel_seller: "late cancellation as seller",
  };
  const reason = reasonMap[type] ?? "policy violation";

  if (count >= 5) {
    return `Due to repeated violations your ability to sell on NearGear has been permanently removed.`;
  }
  if (count >= 3) {
    return `You received a strike for ${reason}. Your selling access has been temporarily suspended.`;
  }
  return `You received a strike for ${reason}. ${5 - count} more strikes may result in suspension.`;
}

/**
 * True iff the user is currently barred from listing or selling.
 * Pure function — accepts the relevant slice of the users row.
 */
export function isSellerSuspended(user: {
  suspension_ends_at: string | null;
  suspended_permanently: boolean | null;
}): boolean {
  if (user.suspended_permanently) return true;
  if (!user.suspension_ends_at) return false;
  return new Date(user.suspension_ends_at) > new Date();
}
