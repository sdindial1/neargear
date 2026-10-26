import * as Sentry from "@sentry/nextjs";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sanitizeText } from "@/lib/sanitize";
import { isPlausibleEmail, normalizeEmail } from "@/lib/giveaway";
import { sendSupportMessageEmail } from "@/lib/notifications/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NAME_MAX = 100;
const MESSAGE_MAX = 5000;
const PATH_MAX = 500;

/** Per-address throttle. Amaro's inbox is the support desk; a loop or a bot
 *  should not be able to bury it. Counted from the table, so it holds across
 *  serverless instances where an in-memory counter would not. */
const THROTTLE_MAX = 5;
const THROTTLE_WINDOW_MS = 60 * 60 * 1000;

/**
 * A same-site path or null. The value comes from the browser, and it ends up
 * as a link in an email, so anything that is not a plain "/path" is dropped:
 * "//evil.com" and "/\evil.com" are protocol-relative to a browser.
 */
function safePagePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const path = raw.trim().slice(0, PATH_MAX);
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) {
    return null;
  }
  if (/[\s<>"']/.test(path)) return null;
  // The form itself is not a useful "page they were on".
  if (path === "/support" || path.startsWith("/support?")) return null;
  return path;
}

/**
 * POST /api/support — the contact-support form.
 *
 * Works signed out. The row is written BEFORE the email is sent, so a failed
 * send still leaves the message in support_messages with email_status saying
 * what happened. The visitor is told it was received once the row exists: at
 * that point nothing is lost, even if the email is.
 *
 * user_id comes from the session cookie, never the body — a client-supplied id
 * would let anyone attribute a message to someone else's account.
 *
 * support_messages has RLS on with no policies and no anon grants (038), so
 * this service-role route is the only writer.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      name?: unknown;
      email?: unknown;
      message?: unknown;
      pagePath?: unknown;
      /** Honeypot. Hidden from people; bots fill every field. */
      website?: unknown;
    };

    // Answer a filled honeypot exactly like a success so the bot learns
    // nothing, and store nothing.
    if (typeof body.website === "string" && body.website.trim()) {
      return Response.json({ ok: true });
    }

    const name = sanitizeText(String(body.name ?? ""), NAME_MAX);
    const email = normalizeEmail(String(body.email ?? ""));
    const message = sanitizeText(String(body.message ?? ""), MESSAGE_MAX);
    const pagePath = safePagePath(body.pagePath);

    if (!name) {
      return Response.json(
        { error: "name_required", message: "Please enter your name." },
        { status: 400 },
      );
    }
    if (!isPlausibleEmail(email)) {
      return Response.json(
        { error: "email_invalid", message: "Please enter a valid email address so we can reply." },
        { status: 400 },
      );
    }
    if (!message) {
      return Response.json(
        { error: "message_required", message: "Please tell us how we can help." },
        { status: 400 },
      );
    }

    const admin = createAdminSupabaseClient();
    if (!admin) {
      console.error("[support] service role not configured");
      Sentry.captureMessage("[support] service role not configured", "error");
      return Response.json(
        {
          error: "unavailable",
          message: "We couldn't send that just now. Please email support@near-gear.com instead.",
        },
        { status: 500 },
      );
    }

    let userId: string | null = null;
    try {
      const supabase = await createServerSupabaseClient();
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id ?? null;
    } catch {
      // Signed out, or an unreadable cookie. The message still matters more
      // than the attribution.
    }

    const since = new Date(Date.now() - THROTTLE_WINDOW_MS).toISOString();
    const { count: recent, error: countErr } = await admin
      .from("support_messages")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .gte("created_at", since);
    // An unreadable count is let through: refusing a real support request
    // because of a throttle lookup is the worse failure.
    if (countErr) {
      console.error("[support] throttle count failed", countErr);
    } else if ((recent ?? 0) >= THROTTLE_MAX) {
      return Response.json(
        {
          error: "too_many",
          message: "We've received several messages from you in the last hour. We'll be in touch — please give us a little time to reply.",
        },
        { status: 429 },
      );
    }

    const { data: row, error: insertErr } = await admin
      .from("support_messages")
      .insert({ name, email, message, page_path: pagePath, user_id: userId })
      .select("id, created_at")
      .single();

    if (insertErr || !row) {
      console.error("[support] insert failed", insertErr);
      Sentry.captureException(insertErr ?? new Error("support insert returned no row"));
      return Response.json(
        {
          error: "insert_failed",
          message: "We couldn't send that just now. Please try again, or email support@near-gear.com.",
        },
        { status: 500 },
      );
    }

    const result = await sendSupportMessageEmail({
      name,
      email,
      message,
      pagePath,
      userId,
      submittedAt: new Date(row.created_at),
    });

    const { error: updateErr } = await admin
      .from("support_messages")
      .update({
        email_status: result.ok ? "sent" : result.reason === "skipped" ? "skipped" : "failed",
        email_provider_id: result.providerId ?? null,
        email_error: result.ok ? null : (result.message ?? null),
      })
      .eq("id", row.id);
    if (updateErr) {
      console.error("[support] status update failed", updateErr);
    }

    if (!result.ok) {
      // The message is saved, so the visitor still gets a success. The inbox
      // did not, and nobody would know without this.
      Sentry.captureMessage(
        `[support] message ${row.id} saved but email ${result.reason}: ${result.message ?? ""}`,
        "error",
      );
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[support] error", err);
    Sentry.captureException(err);
    return Response.json(
      {
        error: "internal",
        message: "Something went wrong. Please try again, or email support@near-gear.com.",
      },
      { status: 500 },
    );
  }
}
