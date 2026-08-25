import * as Sentry from "@sentry/nextjs";
import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { classifyListing, messageFor } from "@/lib/moderation/classify";

export const runtime = "nodejs";
// The classifier is a live model call; the default serverless budget is not
// enough headroom for a slow upstream plus the insert.
export const maxDuration = 60;

/**
 * POST /api/listings — the ONLY path from a seller to a live listing.
 *
 * The sell page used to insert straight from the browser with status hardcoded
 * to 'active'. The anon key ships in the client bundle, so that was never a
 * gate: any account could POST to PostgREST and publish whatever it liked.
 * Migration 026 pins client-side inserts to 'pending_review'; this route holds
 * the service-role key and is the only thing that can publish.
 *
 * The advisory verdict the sell page already got from /api/analyze-listing is
 * NOT accepted here, and is not even read. The seller can edit the title after
 * analysis, and a client-supplied verdict is forgeable. This route re-runs the
 * classifier against the final text and the stored photos, and that result is
 * the decision.
 *
 * Verdict -> outcome:
 *   allow  -> status 'active', live immediately (the overwhelming majority)
 *   error  -> status 'active', flagged verdict 'error' for retroactive sweep
 *             (fail-open: see the note in classify.ts)
 *   review -> status 'pending_review', invisible to everyone but the seller,
 *             earns no sweepstakes entry until approved
 *   block  -> 422, no listing row at all, recorded in moderation_events
 */

/** Generous for a real seller; tight enough to blunt giveaway entry farming. */
const MAX_LISTINGS_PER_HOUR = 25;

interface Body {
  title?: string;
  sport?: string;
  category?: string;
  condition?: string;
  price?: number; // cents
  description?: string;
  city?: string;
  photoUrls?: string[];
  ageMin?: number | null;
  ageMax?: number | null;
  // Passthrough of the existing /api/analyze-listing output. Used only to
  // populate the ai_* display columns — never to make the policy decision.
  analysis?: {
    suggestedPrice?: number;
    retailPrice?: number;
    condition?: string;
    item?: string;
    ageRange?: string;
    size?: string;
    brand?: string;
    confidence?: number;
  } | null;
}

export async function POST(request: NextRequest) {
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

    const body = (await request.json()) as Body;

    // --- Field validation ---------------------------------------------------
    // City and description are required as of 6d86c05: description because the
    // giveaway's Official Rules define a Qualifying Listing as one with an
    // accurate description, city because proximity is the product.
    const title = (body.title ?? "").trim();
    const sport = (body.sport ?? "").trim();
    const category = (body.category ?? "").trim();
    const condition = (body.condition ?? "").trim();
    const description = (body.description ?? "").trim();
    const city = (body.city ?? "").trim();
    const photoUrls = Array.isArray(body.photoUrls) ? body.photoUrls : [];
    const price = Number(body.price);

    const missing: string[] = [];
    if (!title) missing.push("title");
    if (!sport) missing.push("sport");
    if (!category) missing.push("category");
    if (!condition) missing.push("condition");
    if (!description) missing.push("description");
    if (!city) missing.push("city");
    if (!Number.isFinite(price) || price <= 0) missing.push("price");
    if (photoUrls.length === 0) missing.push("photos");
    if (missing.length) {
      return Response.json(
        { error: "missing_fields", fields: missing },
        { status: 400 },
      );
    }

    // --- Rate limit ---------------------------------------------------------
    // DB-backed rather than in-memory: serverless instances don't share state,
    // so an in-process counter would reset on every cold start.
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await admin
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("seller_id", user.id)
      .gte("created_at", since);

    if ((recentCount ?? 0) >= MAX_LISTINGS_PER_HOUR) {
      return Response.json(
        {
          error: "rate_limited",
          message:
            "You've posted a lot of listings in the last hour. Try again shortly, " +
            "or email support@near-gear.com if you're clearing out a whole team's gear.",
        },
        { status: 429 },
      );
    }

    // --- Classify -----------------------------------------------------------
    const verdictResult = await classifyListing({
      title,
      description,
      sport,
      category,
      priceDollars: price / 100,
      images: photoUrls,
    });

    const blocked = verdictResult.verdict === "block";
    const held = verdictResult.verdict === "review";

    // A blocked submission never becomes a listing, so moderation_events is
    // the only record it ever happened. Without it we'd have no way to see the
    // gate being probed.
    const recordEvent = async (listingId: string | null) => {
      const { error: evErr } = await admin.from("moderation_events").insert({
        listing_id: listingId,
        seller_id: user.id,
        verdict: verdictResult.verdict,
        source: verdictResult.source,
        reasons: verdictResult.reasons,
        confidence: verdictResult.confidence,
        model: verdictResult.model,
        title,
        description,
        photo_urls: photoUrls,
      });
      // Never fail the publish because the audit write failed.
      if (evErr) {
        console.error("[listings] moderation_events insert failed", evErr);
        Sentry.captureException(evErr);
      }
    };

    if (blocked) {
      await recordEvent(null);
      return Response.json(
        {
          error: "rejected",
          verdict: "block",
          reasons: verdictResult.reasons,
          message: messageFor("block"),
        },
        { status: 422 },
      );
    }

    // --- Insert -------------------------------------------------------------
    const analysis = body.analysis ?? null;
    const ageMin = Number.isFinite(Number(body.ageMin)) ? Number(body.ageMin) : null;
    const ageMax = Number.isFinite(Number(body.ageMax)) ? Number(body.ageMax) : null;

    const { data: listing, error: insertError } = await admin
      .from("listings")
      .insert({
        seller_id: user.id,
        title,
        sport,
        category,
        condition,
        price: Math.round(price),
        description,
        photo_urls: photoUrls,
        status: held ? "pending_review" : "active",
        moderation_verdict: verdictResult.verdict,
        moderation_reasons: verdictResult.reasons,
        moderation_confidence: verdictResult.confidence,
        // Only stamped when a human decides. An auto-approval leaves this null
        // so "never looked at by a person" stays a queryable state.
        moderated_at: null,
        moderated_by: null,
        ai_suggested_price: analysis?.suggestedPrice
          ? Math.round(analysis.suggestedPrice * 100)
          : null,
        retail_price: analysis?.retailPrice
          ? Math.round(analysis.retailPrice * 100)
          : null,
        ai_condition_grade: analysis?.condition ?? null,
        ai_identified_item: analysis?.item ?? null,
        ai_age_range:
          ageMin != null && ageMax != null
            ? `${ageMin}-${ageMax}`
            : (analysis?.ageRange ?? null),
        ai_size: analysis?.size ?? null,
        ai_brand: analysis?.brand ?? null,
        ai_confidence: analysis?.confidence ?? null,
        city,
        age_min: ageMin,
        age_max: ageMax,
      })
      .select("id")
      .single();

    if (insertError || !listing) {
      console.error("[listings] insert failed", insertError);
      Sentry.captureException(insertError);
      return Response.json({ error: "insert_failed" }, { status: 500 });
    }

    await recordEvent(listing.id);

    return Response.json({
      ok: true,
      listingId: listing.id,
      verdict: verdictResult.verdict,
      held,
      isTradingCard: verdictResult.isTradingCard,
      message: verdictResult.sellerMessage,
    });
  } catch (err) {
    console.error("[listings] unexpected", err);
    Sentry.captureException(err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
