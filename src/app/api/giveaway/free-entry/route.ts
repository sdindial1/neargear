import * as Sentry from "@sentry/nextjs";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { sanitizeText } from "@/lib/sanitize";
import {
  isPlausibleEmail,
  isTexasZip,
  normalizeEmail,
  PROMOTION_END_ISO,
  PROMOTION_START_ISO,
} from "@/lib/giveaway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/giveaway/free-entry — the free alternate method of entry (AMOE).
 *
 * This is a LEGAL REQUIREMENT, not a nice-to-have. Official Rules §4.2 points
 * entrants here, and a sweepstakes whose free entry path is broken is worse
 * than one with no free entry at all.
 *
 * Works logged out by design: no account, no listing, no purchase.
 *
 * WHY THIS IS THE ONLY WRITER
 * sweepstakes_entries has RLS on with no policies and no grants to anon, so
 * nothing can insert except a service-role client. Had anon held INSERT, the
 * daily limit would be decoration — the anon key ships in the client bundle,
 * so anyone could POST straight to PostgREST and skip every check below.
 *
 * The daily limit is enforced in two places: a pre-check here for a friendly
 * message, and a unique index on (email, entry_date) in the database that
 * actually guarantees it. The pre-check alone cannot win a race between two
 * simultaneous submissions.
 */
export async function POST(request: Request) {
  try {
    // Promotion window (Rules §3). Outside it, entries are void — so refuse
    // rather than bank something that can never be drawn.
    const now = Date.now();
    if (now < Date.parse(PROMOTION_START_ISO)) {
      return Response.json(
        { error: "not_started", message: "The giveaway hasn't started yet." },
        { status: 409 },
      );
    }
    if (now > Date.parse(PROMOTION_END_ISO)) {
      return Response.json(
        {
          error: "closed",
          message:
            "The giveaway has closed and entries are no longer being accepted.",
        },
        { status: 409 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      firstName?: string;
      lastName?: string;
      email?: string;
      zip?: string;
    };

    const firstName = sanitizeText(body.firstName ?? "", 60).trim();
    const lastName = sanitizeText(body.lastName ?? "", 60).trim();
    const email = normalizeEmail(body.email ?? "");
    const zip = (body.zip ?? "").trim();

    if (!firstName || !lastName) {
      return Response.json(
        { error: "name_required", message: "Please enter your first and last name." },
        { status: 400 },
      );
    }
    if (!isPlausibleEmail(email)) {
      return Response.json(
        { error: "email_invalid", message: "Please enter a valid email address." },
        { status: 400 },
      );
    }
    // Rules §2: Texas residents only. Rejecting here keeps ineligible entries
    // out of the pool entirely rather than needing to weed them at drawing time.
    if (!isTexasZip(zip)) {
      return Response.json(
        {
          error: "zip_not_texas",
          message:
            "This giveaway is open to Texas residents only, and that ZIP code isn't in Texas.",
        },
        { status: 400 },
      );
    }

    const admin = createAdminSupabaseClient();
    if (!admin) {
      console.error("[giveaway/free-entry] service role not configured");
      return Response.json(
        { error: "unavailable", message: "Entries are temporarily unavailable. Please try again shortly." },
        { status: 500 },
      );
    }

    const { error } = await admin
      .from("sweepstakes_entries")
      .insert({ first_name: firstName, last_name: lastName, email, zip });

    if (error) {
      // 23505 = the (email, entry_date) unique index. Already entered today.
      if (error.code === "23505") {
        return Response.json(
          {
            error: "already_entered_today",
            message:
              "You've already entered today. You can enter again tomorrow — one free entry per person per day.",
          },
          { status: 409 },
        );
      }
      console.error("[giveaway/free-entry] insert failed", error);
      Sentry.captureException(error);
      return Response.json(
        { error: "insert_failed", message: "Something went wrong saving your entry. Please try again." },
        { status: 500 },
      );
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[giveaway/free-entry] error", err);
    Sentry.captureException(err);
    return Response.json(
      { error: "internal", message: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
