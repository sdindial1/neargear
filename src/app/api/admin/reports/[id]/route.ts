import * as Sentry from "@sentry/nextjs";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { isAdmin } from "@/lib/admin";

const ALLOWED = new Set(["pending", "dismissed", "actioned"]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !isAdmin(user.email)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      status?: string;
    };
    const status = body.status;
    if (!status || !ALLOWED.has(status)) {
      return Response.json({ error: "Invalid status" }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    if (!admin) {
      return Response.json({ error: "Service role not configured" }, { status: 500 });
    }

    const { error } = await admin
      .from("reports")
      .update({ status })
      .eq("id", id);

    if (error) {
      console.error("[admin/reports] update failed", error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[admin/reports] error", err);
    Sentry.captureException(err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
