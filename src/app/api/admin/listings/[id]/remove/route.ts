import * as Sentry from "@sentry/nextjs";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { isAdmin } from "@/lib/admin";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
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

    const { error } = await admin
      .from("listings")
      .update({ status: "removed" })
      .eq("id", id);

    if (error) {
      console.error("[admin remove-listing]", error);
      Sentry.captureException(error);
      return Response.json(
        { error: "Something went wrong" },
        { status: 500 },
      );
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[admin remove-listing] unexpected", err);
    Sentry.captureException(err);
    return Response.json(
      { error: "Something went wrong" },
      { status: 500 },
    );
  }
}
