import * as Sentry from "@sentry/nextjs";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { sendFoundingWelcomeEmail } from "@/lib/notifications/email";

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminSupabaseClient();
    if (!admin) {
      return Response.json(
        { error: "Service role not configured" },
        { status: 500 },
      );
    }

    const { data: profile, error: profileErr } = await admin
      .from("users")
      .select("id, email, full_name, is_founding_member")
      .eq("id", user.id)
      .single();
    if (profileErr || !profile) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }
    if (profile.is_founding_member) {
      return Response.json(
        { error: "already_founding", message: "You're already a Founding Family." },
        { status: 409 },
      );
    }

    // Atomic claim — locks the counter row, increments, and flips the user flag.
    // Returns the new spots_claimed value, or NULL if no spots remain.
    const { data: claimedNum, error: rpcErr } = await admin.rpc(
      "claim_founding_spot",
      { claimer_id: user.id },
    );
    if (rpcErr) {
      console.error("[founding/claim] rpc error", rpcErr);
      return Response.json({ error: rpcErr.message }, { status: 500 });
    }
    if (claimedNum === null) {
      return Response.json(
        {
          error: "spots_full",
          message: "All founding spots have been claimed.",
        },
        { status: 409 },
      );
    }

    const { data: counter } = await admin
      .from("founding_spots")
      .select("spots_claimed, total_spots")
      .eq("id", 1)
      .single();
    const total = counter?.total_spots ?? 15;
    const claimed = counter?.spots_claimed ?? Number(claimedNum);
    const remaining = Math.max(0, total - claimed);

    void sendFoundingWelcomeEmail({
      to: { email: profile.email, fullName: profile.full_name ?? null },
      spotsRemaining: remaining,
      totalSpots: total,
    });

    return Response.json({
      ok: true,
      spotsClaimed: claimed,
      totalSpots: total,
      spotsRemaining: remaining,
    });
  } catch (err) {
    console.error("[founding/claim] error", err);
    Sentry.captureException(err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
