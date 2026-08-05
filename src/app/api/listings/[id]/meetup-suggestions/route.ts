import * as Sentry from "@sentry/nextjs";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import {
  getSuggestedMeetupLocationsByZip,
  getAllZonesByCombinedDistance,
} from "@/lib/safezones";
import { isValidZipcodeFormat } from "@/lib/zipcodes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/listings/[id]/meetup-suggestions   body: { buyerZipcode }
 *
 * Suggests safe meetup spots roughly between the buyer and the seller.
 *
 * WHY THIS IS A ROUTE AND NOT A CLIENT COMPUTATION
 * It needs the SELLER's zipcode, and migration 020 deliberately keeps zipcode
 * out of the public_profiles view — a postcode is materially more precise than
 * the city already shown on a listing, and it is a family's home area. Simply
 * returning the seller's zip to the client would defeat that.
 *
 * So the seller's zip is read here with the service role, combined with the
 * buyer's, and only the resulting SAFE ZONES are returned. The seller's zip
 * never leaves the server.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: listingId } = await params;

    // Authenticated callers only — this is a step in the buying flow, and it
    // shouldn't be a way to probe sellers' locations anonymously.
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      buyerZipcode?: string;
    };
    const buyerZipcode =
      body.buyerZipcode && isValidZipcodeFormat(body.buyerZipcode)
        ? body.buyerZipcode
        : null;

    const admin = createAdminSupabaseClient();
    if (!admin) {
      return Response.json(
        { error: "Service role not configured" },
        { status: 500 },
      );
    }

    const { data: listing } = await admin
      .from("listings")
      .select("id, seller:users!seller_id(zipcode)")
      .eq("id", listingId)
      .maybeSingle();

    if (!listing) {
      return Response.json({ error: "Listing not found" }, { status: 404 });
    }

    const sellerRel = (listing as { seller: { zipcode: string | null } | { zipcode: string | null }[] | null }).seller;
    const seller = Array.isArray(sellerRel) ? (sellerRel[0] ?? null) : sellerRel;
    const sellerZipcode = seller?.zipcode ?? null;

    // Only zones go back over the wire. Never sellerZipcode.
    return Response.json({
      recommended: getSuggestedMeetupLocationsByZip(buyerZipcode, sellerZipcode, 3),
      all: getAllZonesByCombinedDistance(buyerZipcode, sellerZipcode),
    });
  } catch (err) {
    console.error("[meetup-suggestions] error", err);
    Sentry.captureException(err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
