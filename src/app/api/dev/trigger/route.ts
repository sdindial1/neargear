import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { cancelMeetup } from "@/lib/meetups/cancel";
import { reportNoShow } from "@/lib/meetups/no-show";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TEMPORARY — payments Phase 4 test trigger. DELETE before Phase 4 merges.
 *
 * Fires the real cancel / no-show flows from PowerShell, without a browser
 * session. It calls cancelMeetup() and reportNoShow() — the SAME functions the
 * production routes call — so the 24-hour cutoff, the freeze, the auto-refund
 * and the notifications are all genuinely exercised. The only thing skipped is
 * the auth check, which is why the actor is chosen explicitly here.
 *
 * That distinction is the whole point: a harness that reimplemented the branch
 * logic would be testing the harness.
 *
 * HARD-GUARDED: 404 in production, referenced by no UI.
 *
 *   POST /api/dev/trigger?action=cancel&orderId=<uuid>&as=buyer
 *   POST /api/dev/trigger?action=cancel&meetupId=<uuid>&as=seller&reason=...
 *   POST /api/dev/trigger?action=no-show&orderId=<uuid>&as=buyer
 *
 * `as` is which participant performs the action. For no-show it maps straight
 * to `role`, so `as=buyer` means the buyer reports a SELLER no-show.
 * Accepts an orderId for convenience and resolves its meetup.
 */

function blockedInProduction(): Response | null {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }
  return null;
}

export async function POST(request: Request) {
  const blocked = blockedInProduction();
  if (blocked) return blocked;

  const url = new URL(request.url);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const pick = (k: string): string | null =>
    url.searchParams.get(k) ?? (body[k] == null ? null : String(body[k]));

  const action = pick("action");
  if (action !== "cancel" && action !== "no-show") {
    return Response.json(
      { error: "action must be 'cancel' or 'no-show'" },
      { status: 400 },
    );
  }

  const as = pick("as");
  if (as !== "buyer" && as !== "seller") {
    return Response.json(
      { error: "as must be 'buyer' or 'seller'" },
      { status: 400 },
    );
  }

  const admin = createAdminSupabaseClient();
  if (!admin) {
    return Response.json({ error: "service role not configured" }, { status: 500 });
  }

  // Resolve the meetup — accept either a meetupId or an orderId.
  let meetupId = pick("meetupId");
  const orderId = pick("orderId");
  if (!meetupId && orderId) {
    const { data } = await admin
      .from("orders")
      .select("meetup_id")
      .eq("id", orderId)
      .maybeSingle();
    meetupId = (data as { meetup_id: string | null } | null)?.meetup_id ?? null;
  }
  if (!meetupId) {
    return Response.json(
      { error: "meetupId or orderId required (order must have a meetup)" },
      { status: 400 },
    );
  }

  // Whose id to act as.
  const { data: meetupRow } = await admin
    .from("meetups")
    .select("buyer_id, seller_id")
    .eq("id", meetupId)
    .maybeSingle();
  const parties = meetupRow as { buyer_id: string; seller_id: string } | null;
  if (!parties) {
    return Response.json({ error: "meetup not found" }, { status: 404 });
  }
  const actorId = as === "buyer" ? parties.buyer_id : parties.seller_id;

  const result =
    action === "cancel"
      ? await cancelMeetup(admin, {
          meetupId,
          actorId,
          reason: pick("reason") ?? "dev trigger",
        })
      : await reportNoShow(admin, { meetupId, actorId, role: as });

  // Always 200 — the result body carries the outcome, so failures are as easy
  // to read as successes.
  return Response.json({ action, as, meetupId, actorId, result });
}
