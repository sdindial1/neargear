import * as Sentry from "@sentry/nextjs";
import { requireAdmin } from "@/lib/admin-guard";

// POST /api/admin/partners/[id]/members/[userId]/verify
// Toggle (or explicitly set) a user's partner_verified flag. Manual for now —
// an admin marks a user as a verified member of this partner program.
// Body (optional): { verified: boolean }. If omitted, the current value flips.
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; userId: string }> },
) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
    const { admin } = guard;
    const { id: partnerId, userId } = await context.params;

    const { data: target, error: fetchError } = await admin
      .from("users")
      .select("id, partner_program_id, partner_verified")
      .eq("id", userId)
      .maybeSingle();

    if (fetchError) {
      console.error("[admin partner verify] fetch", fetchError);
      Sentry.captureException(fetchError);
      return Response.json({ error: "Something went wrong" }, { status: 500 });
    }
    if (!target) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }
    if (target.partner_program_id !== partnerId) {
      return Response.json(
        { error: "User is not a member of this partner program" },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const nextVerified =
      typeof body?.verified === "boolean"
        ? body.verified
        : !target.partner_verified;

    const { error } = await admin
      .from("users")
      .update({
        partner_verified: nextVerified,
        partner_verified_at: nextVerified ? new Date().toISOString() : null,
      })
      .eq("id", userId);

    if (error) {
      console.error("[admin partner verify] update", error);
      Sentry.captureException(error);
      return Response.json({ error: "Something went wrong" }, { status: 500 });
    }

    return Response.json({ ok: true, verified: nextVerified });
  } catch (err) {
    console.error("[admin partner verify] unexpected", err);
    Sentry.captureException(err);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}
