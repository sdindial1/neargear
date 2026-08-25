import * as Sentry from "@sentry/nextjs";
import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { isAdmin } from "@/lib/admin";
import {
  sendListingApprovedEmail,
  sendListingRejectedEmail,
} from "@/lib/notifications/email";

export const runtime = "nodejs";

/**
 * POST /api/admin/moderation/[id] — approve or reject a listing.
 *
 * Same shape as /api/admin/listings/[id]/remove: thin auth wrapper, service
 * role for the write. The service role is what makes this work at all — the
 * enforce_moderation_hold trigger from 025 refuses to let anything
 * authenticated move a listing out of pending_review, and only service_role
 * passes through it.
 *
 * Approving a held listing publishes it, which also makes it count toward the
 * giveaway: the public counter and the drawing audit both filter on
 * status = 'active', and created_at is unchanged, so the entry lands inside
 * the original Promotion Period window. That is Official Rules 4.1 as written
 * ("remains posted and active") — no amendment needed.
 */

interface Body {
  action?: "approve" | "reject";
  reason?: string;
}

export async function POST(
  request: NextRequest,
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

    const { action, reason } = (await request.json()) as Body;
    if (action !== "approve" && action !== "reject") {
      return Response.json({ error: "bad_action" }, { status: 400 });
    }
    if (action === "reject" && (!reason || reason.trim().length < 5)) {
      return Response.json({ error: "reason_required" }, { status: 400 });
    }

    const { data: listing, error: readErr } = await admin
      .from("listings")
      .select(
        "id, title, status, photo_urls, condition, seller:users!seller_id(full_name, email)",
      )
      .eq("id", id)
      .maybeSingle();

    if (readErr) {
      console.error("[admin/moderation] read failed", readErr);
      Sentry.captureException(readErr);
      return Response.json({ error: "read_failed" }, { status: 500 });
    }
    if (!listing) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }

    const seller = Array.isArray(listing.seller)
      ? listing.seller[0]
      : listing.seller;

    // Only two states are actionable: held, or live-but-unswept. Anything else
    // (already sold, already removed) means someone acted between the page
    // render and the click.
    const actionable =
      listing.status === "pending_review" || listing.status === "active";
    if (!actionable) {
      return Response.json(
        { error: "not_actionable", status: listing.status },
        { status: 409 },
      );
    }

    const { error: updErr } = await admin
      .from("listings")
      .update({
        status: action === "approve" ? "active" : "removed",
        // Overwrite 'error' so a swept listing stops showing in the sweep list.
        moderation_verdict: action === "approve" ? "allow" : "block",
        moderated_at: new Date().toISOString(),
        moderated_by: user.email,
      })
      .eq("id", id);

    if (updErr) {
      console.error("[admin/moderation] update failed", updErr);
      Sentry.captureException(updErr);
      return Response.json({ error: "update_failed" }, { status: 500 });
    }

    // Audit row. Written after the state change so it can never claim an
    // outcome that did not happen.
    const { error: evErr } = await admin.from("moderation_events").insert({
      listing_id: id,
      seller_id: null,
      verdict: action === "approve" ? "allow" : "block",
      source: "model",
      reasons: [`admin_${action}`, ...(reason ? [`note:${reason.slice(0, 200)}`] : [])],
      confidence: null,
      model: null,
      title: listing.title,
      description: null,
      photo_urls: listing.photo_urls ?? [],
    });
    if (evErr) {
      console.error("[admin/moderation] event insert failed", evErr);
      Sentry.captureException(evErr);
    }

    // Email is best-effort. A failed send must not roll back a decision that
    // already took effect, or the queue would show a listing as still held
    // when it is live.
    if (seller?.email) {
      const emailListing = {
        title: listing.title ?? "your listing",
        imageUrl: listing.photo_urls?.[0] ?? null,
        condition: listing.condition ?? null,
      };
      try {
        if (action === "approve") {
          // Only tell a seller their listing "is now live" if it was actually
          // held. Clearing a sweep flag changes nothing they can see, and an
          // approval email for a listing that was never hidden reads as a bug.
          if (listing.status === "pending_review") {
            await sendListingApprovedEmail({
              seller: { email: seller.email, fullName: seller.full_name },
              listing: emailListing,
              listingId: id,
            });
          }
        } else {
          await sendListingRejectedEmail({
            seller: { email: seller.email, fullName: seller.full_name },
            listing: emailListing,
            reason: reason!.trim(),
          });
        }
      } catch (mailErr) {
        console.error("[admin/moderation] email failed", mailErr);
        Sentry.captureException(mailErr);
      }
    }

    return Response.json({ ok: true, action });
  } catch (err) {
    console.error("[admin/moderation] unexpected", err);
    Sentry.captureException(err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
