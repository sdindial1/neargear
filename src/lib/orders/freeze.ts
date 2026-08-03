import type { SupabaseClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";

/**
 * Freeze an order's auto-release — payments Phase 3, rung 4.
 *
 * Stamping orders.disputed_at makes the order unclaimable by releaseOrder's
 * CAS and invisible to the cron sweep's candidate query. Nothing here refunds
 * anything: freezing only stops money leaving. Resolution is Phase 4.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE SWEEP'S STATUS ALLOWLIST
 * The sweep already refuses to release unless the meetup is 'scheduled' or
 * 'completed', which covers no-shows and cancellations. That allowlist is a
 * backstop keyed on a *related* row. This is the explicit signal on the order
 * itself, so the freeze holds even if a meetup later moves back into a
 * releasable status, and so the reason is visible on the money record rather
 * than inferred from a join.
 */

/** Order states where funds are still held on the platform, or recoverable. */
const FREEZABLE_STATUSES = [
  "pending", // checkout started, may still capture
  "paid_held", // the normal case
  "releasing", // transfer in flight — if it fails, the retry must not fire
  "release_failed", // parked after exhausting retries
];

/**
 * Why an order is frozen.
 *
 * `cancelled_late` is mechanically a dispute: a buyer cancelling inside 24h of
 * the meetup window freezes and goes to the same admin queue for the same
 * binary decision. It is a distinct reason only so the queue can explain
 * itself — there is no separate late-cancel machinery.
 */
export type FreezeReason =
  | "item_dispute"
  | "no_show"
  | "cancelled"
  | "cancelled_late";

export interface FreezeResult {
  /** How many orders were newly frozen by this call. */
  frozen: number;
  /** True when money had already left for this meetup — a Phase 4 reversal case. */
  alreadyReleased: boolean;
}

/**
 * Freeze every still-holding order attached to a meetup. Idempotent: orders
 * already frozen are skipped, so re-reporting doesn't churn the timestamp.
 * Never throws — a freeze failure must not break the state transition that
 * triggered it, but it IS logged loudly because it means a timer is still live.
 */
export async function freezeOrdersForMeetup(
  admin: SupabaseClient,
  meetupId: string,
  reason: FreezeReason,
): Promise<FreezeResult> {
  const result: FreezeResult = { frozen: 0, alreadyReleased: false };

  try {
    const { data, error } = await admin
      .from("orders")
      .update({
        disputed_at: new Date().toISOString(),
        // Recorded on the ORDER so the admin review queue is order-driven and
        // needs no join to explain why something is held.
        freeze_reason: reason,
      })
      .eq("meetup_id", meetupId)
      .in("status", FREEZABLE_STATUSES)
      .is("disputed_at", null)
      .select("id, status");

    if (error) {
      // Loud: the auto-release timer for this meetup is still running.
      console.error(
        `[freeze] FAILED to freeze orders for meetup ${meetupId} (${reason}) — auto-release is still live:`,
        error,
      );
      Sentry.captureException(error);
    } else {
      const rows = (data ?? []) as { id: string; status: string }[];
      result.frozen = rows.length;
      for (const r of rows) {
        console.log(
          `[freeze] order ${r.id} (${r.status}) frozen for meetup ${meetupId}: ${reason}`,
        );
      }
    }

    // Did money already go out? Not an error — but Phase 4 will need to reverse
    // it, and we want that visible now rather than discovered later.
    const { data: released } = await admin
      .from("orders")
      .select("id, stripe_transfer_id")
      .eq("meetup_id", meetupId)
      .eq("status", "released")
      .maybeSingle();

    if (released) {
      const r = released as { id: string; stripe_transfer_id: string | null };
      result.alreadyReleased = true;
      console.warn(
        `[freeze] meetup ${meetupId} reported as ${reason} but order ${r.id} was ALREADY RELEASED ` +
          `(transfer ${r.stripe_transfer_id}). Funds are with the seller; reversal is a Phase 4 concern.`,
      );
    }
  } catch (err) {
    console.error(`[freeze] unexpected failure for meetup ${meetupId}`, err);
    Sentry.captureException(err);
  }

  return result;
}
