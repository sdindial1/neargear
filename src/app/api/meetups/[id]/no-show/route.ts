import * as Sentry from "@sentry/nextjs";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { reportNoShow } from "@/lib/meetups/no-show";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/meetups/[id]/no-show   body: { role: "buyer" | "seller" }
 *
 * Thin auth wrapper. All outcome logic — the strike, the freeze, the
 * seller-no-show auto-refund — lives in reportNoShow() so there is one
 * implementation the dev trigger can exercise without reimplementing it.
 *
 * `role` is who is REPORTING, not who failed to show.
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

    const body = (await request.json().catch(() => ({}))) as {
      role?: "buyer" | "seller";
    };
    if (body.role !== "buyer" && body.role !== "seller") {
      return Response.json(
        { error: "Invalid role", valid: ["buyer", "seller"] },
        { status: 400 },
      );
    }

    const admin = createAdminSupabaseClient();
    if (!admin) {
      return Response.json(
        { error: "Service role not configured" },
        { status: 500 },
      );
    }

    const result = await reportNoShow(admin, {
      meetupId,
      actorId: user.id,
      role: body.role,
    });

    if (!result.ok) {
      return Response.json(
        { error: result.error, message: result.message },
        { status: result.status },
      );
    }
    return Response.json(result);
  } catch (err) {
    console.error("[no-show] error", err);
    Sentry.captureException(err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
