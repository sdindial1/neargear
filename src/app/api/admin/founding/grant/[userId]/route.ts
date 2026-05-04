import * as Sentry from "@sentry/nextjs";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { isAdmin } from "@/lib/admin";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { userId } = await params;
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !isAdmin(user.email)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminSupabaseClient();
    if (!admin) {
      return Response.json(
        { error: "Service role not configured" },
        { status: 500 },
      );
    }

    // Same atomic claim used by the public flow — bumps the counter and
    // flips the user flag in one transaction.
    const { data: claimedNum, error: rpcErr } = await admin.rpc(
      "claim_founding_spot",
      { claimer_id: userId },
    );
    if (rpcErr) {
      console.error("[admin/founding/grant] rpc error", rpcErr);
      return Response.json({ error: rpcErr.message }, { status: 500 });
    }
    if (claimedNum === null) {
      return Response.json(
        {
          error: "spots_full_or_already",
          message: "User is already a founder, or spots are full.",
        },
        { status: 409 },
      );
    }

    return Response.json({ ok: true, spotsClaimed: claimedNum });
  } catch (err) {
    console.error("[admin/founding/grant] error", err);
    Sentry.captureException(err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
