import * as Sentry from "@sentry/nextjs";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { cancelMeetup } from "@/lib/meetups/cancel";
import { sanitizeText } from "@/lib/sanitize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/meetups/[id]/cancel
 *
 * Thin auth wrapper. All cancellation logic — the 24h buyer cutoff, the freeze,
 * the auto-refund, the notifications — lives in cancelMeetup() so there is one
 * implementation the dev trigger can exercise without reimplementing it.
 *
 * Moved server-side in Phase 4 Step 1: the cancel page previously wrote
 * meetups.status straight from the browser, which meant a cancellation could
 * not freeze the order (the browser holds the anon key and `orders` has no RLS
 * UPDATE policy, correctly). A meetup cancelled after payment left a live
 * auto-release timer pointed at the seller.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: meetupId } = await params;

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { reason?: string };
    const reason = sanitizeText(body.reason ?? "", 200);

    const admin = createAdminSupabaseClient();
    if (!admin) {
      return Response.json(
        { error: "Service role not configured" },
        { status: 500 },
      );
    }

    const result = await cancelMeetup(admin, {
      meetupId,
      actorId: user.id,
      reason,
    });

    if (!result.ok) {
      return Response.json(
        { error: result.error, message: result.message },
        { status: result.status },
      );
    }
    return Response.json(result);
  } catch (err) {
    console.error("[cancel] error", err);
    Sentry.captureException(err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
