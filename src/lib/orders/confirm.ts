import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared guard for the two Phase 3 confirmation routes.
 *
 * Both /api/orders/[id]/confirm-receipt (buyer) and .../confirm-handoff
 * (seller) need the same checks before they touch anything: the order exists,
 * the caller is the right participant, it isn't frozen by a dispute, and the
 * money is actually captured and held.
 *
 * That last check is requirement (a) — no confirmation, and therefore no
 * completion, without a paid order. It is enforced here at the route layer and
 * again by the mig-015 trigger at the database layer.
 */

export interface ConfirmableOrder {
  id: string;
  meetup_id: string | null;
  listing_id: string | null;
  buyer_id: string | null;
  seller_id: string | null;
  status: string;
  /** Agreed item price in cents — shown in the rung-2 buyer email. */
  item_price_cents: number;
  buyer_confirmed_at: string | null;
  seller_confirmed_at: string | null;
  buyer_notified_at: string | null;
  disputed_at: string | null;
}

const CONFIRM_SELECT =
  "id, meetup_id, listing_id, buyer_id, seller_id, status, item_price_cents, " +
  "buyer_confirmed_at, seller_confirmed_at, buyer_notified_at, disputed_at";

export type ConfirmGuardResult =
  | { ok: true; order: ConfirmableOrder }
  | { ok: false; status: number; error: string; message: string };

/**
 * Load an order and assert the caller may confirm it in `role`.
 * Returns a ready-to-send error shape rather than throwing.
 */
export async function loadConfirmableOrder(
  admin: SupabaseClient,
  orderId: string,
  userId: string,
  role: "buyer" | "seller",
): Promise<ConfirmGuardResult> {
  const { data, error } = await admin
    .from("orders")
    .select(CONFIRM_SELECT)
    .eq("id", orderId)
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false,
      status: 404,
      error: "order_not_found",
      message: "We couldn't find that order.",
    };
  }

  const order = data as unknown as ConfirmableOrder;

  const expectedId = role === "buyer" ? order.buyer_id : order.seller_id;
  if (expectedId !== userId) {
    // Deliberately vague: don't confirm the order exists to a non-participant.
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: "You're not the " + role + " on this order.",
    };
  }

  if (order.disputed_at) {
    return {
      ok: false,
      status: 409,
      error: "disputed",
      message:
        "This order has an open dispute. Our team will be in touch — the payment stays held until it's resolved.",
    };
  }

  if (order.status !== "paid_held") {
    // Tailored messages: "already done" reads very differently from "not paid".
    if (order.status === "released" || order.status === "releasing") {
      return {
        ok: false,
        status: 409,
        error: "already_released",
        message: "This order is already complete.",
      };
    }
    if (order.status === "pending") {
      return {
        ok: false,
        status: 409,
        error: "not_paid",
        message:
          "Payment for this order hasn't completed yet, so it can't be confirmed.",
      };
    }
    return {
      ok: false,
      status: 409,
      error: "not_confirmable",
      message: `This order is ${order.status} and can't be confirmed.`,
    };
  }

  return { ok: true, order };
}
