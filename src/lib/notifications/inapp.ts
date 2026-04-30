import { createAdminSupabaseClient } from "@/lib/supabase-admin";

export type NotificationType =
  | "meetup_request"
  | "meetup_accepted"
  | "meetup_declined"
  | "transaction_complete"
  | "meetup_reminder"
  | "wishlist_reactivated"
  | "review_received";

export interface CreateNotificationInput {
  userId: string | null;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
}

/**
 * Insert an in-app notification. Uses the service-role client so it can
 * bypass RLS (notifications.INSERT is locked down on the client). Failures
 * are logged but never thrown — notification delivery must never break the
 * primary write that triggered it.
 */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<void> {
  if (!input.userId) {
    console.log(`[notify:skip] no userId for ${input.type}: ${input.title}`);
    return;
  }
  const admin = createAdminSupabaseClient();
  if (!admin) {
    console.log(
      `[notify:skip] no service role, would notify ${input.userId}: ${input.title}`,
    );
    return;
  }
  try {
    const { error } = await admin.from("notifications").insert({
      user_id: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link ?? null,
    });
    if (error) {
      console.error(`[notify:error] ${input.userId}:`, error.message);
      return;
    }
    console.log(`[notify:sent] ${input.userId} ${input.type}`);
  } catch (err) {
    console.error(`[notify:throw] ${input.userId}:`, err);
  }
}
