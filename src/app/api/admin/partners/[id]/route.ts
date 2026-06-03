import * as Sentry from "@sentry/nextjs";
import { requireAdmin } from "@/lib/admin-guard";
import { emptyToNull } from "@/lib/partner";

const ALLOWED_STATUS = ["active", "paused", "ended"];

// PATCH /api/admin/partners/[id] — update a partner program (admin only).
// Slug is intentionally NOT updatable here (changing it breaks referral links).
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
    const { admin } = guard;
    const { id } = await context.params;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return Response.json({ error: "Invalid body" }, { status: 400 });
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if ("name" in body) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) {
        return Response.json({ error: "Name is required" }, { status: 400 });
      }
      update.name = name;
    }

    if ("rev_share_percent" in body) {
      const revShare = Number(body.rev_share_percent);
      if (Number.isNaN(revShare) || revShare < 0 || revShare > 100) {
        return Response.json(
          { error: "Revenue share must be between 0 and 100" },
          { status: 400 },
        );
      }
      update.rev_share_percent = revShare;
    }

    if ("status" in body) {
      if (!ALLOWED_STATUS.includes(body.status)) {
        return Response.json({ error: "Invalid status" }, { status: 400 });
      }
      update.status = body.status;
    }

    if ("is_nonprofit" in body) update.is_nonprofit = Boolean(body.is_nonprofit);

    for (const field of [
      "legal_name",
      "ein",
      "badge_text",
      "badge_color",
      "contact_name",
      "contact_email",
      "contact_phone",
      "start_date",
      "end_date",
      "landing_page_url",
      "notes",
    ]) {
      if (field in body) update[field] = emptyToNull(body[field]);
    }

    const { error } = await admin
      .from("partner_programs")
      .update(update)
      .eq("id", id);

    if (error) {
      console.error("[admin partners update]", error);
      Sentry.captureException(error);
      return Response.json({ error: "Something went wrong" }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[admin partners update] unexpected", err);
    Sentry.captureException(err);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}

// DELETE /api/admin/partners/[id] — soft-delete (status -> 'ended'). We never
// hard-delete: payout/attribution history must survive.
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
    const { admin } = guard;
    const { id } = await context.params;

    const { error } = await admin
      .from("partner_programs")
      .update({ status: "ended", updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      console.error("[admin partners delete]", error);
      Sentry.captureException(error);
      return Response.json({ error: "Something went wrong" }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[admin partners delete] unexpected", err);
    Sentry.captureException(err);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}
