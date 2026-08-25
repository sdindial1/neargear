import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

/**
 * POST /api/listings/pixel-dispatch  *** TEMPORARY — see migration 027 ***
 *
 * Records what the browser reported doing with the ListingCreated pixel event.
 * Meta's Events Manager knows whether an event ARRIVED; only the browser knows
 * whether one was ever SENT. Comparing the two is the whole point — the
 * disagreement is the diagnosis, not either source alone.
 *
 * Service-role write, because the client must not be able to author its own
 * diagnostic. The anon key ships in the browser bundle, so an anon-writable
 * column records whatever a caller claims. Same reasoning as 025/026.
 *
 * DELETE THIS ROUTE when 027 is dropped.
 *
 * This endpoint is best-effort by design and the caller never awaits it. It
 * still returns real status codes so a failure is visible in the network tab,
 * but nothing on the seller's path reads them.
 */

const VALID = new Set([
  "disabled",
  "opted_out",
  "absent",
  "queued",
  "dispatched",
]);

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { listingId, status } = (await request.json()) as {
      listingId?: string;
      status?: string;
    };

    if (!listingId || typeof listingId !== "string") {
      return Response.json({ error: "listingId required" }, { status: 400 });
    }
    if (!status || !VALID.has(status)) {
      return Response.json({ error: "bad status" }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    if (!admin) {
      // Not configured is not an error worth surfacing — the probe is optional.
      return Response.json({ ok: false, reason: "no_service_role" });
    }

    // Scoped to the caller's own listing. Without the seller_id predicate this
    // would let any signed-in user stamp a status onto any listing, which for a
    // diagnostic means quietly poisoning the answer we are trying to read.
    const { error } = await admin
      .from("listings")
      .update({
        pixel_dispatch_status: status,
        pixel_dispatch_at: new Date().toISOString(),
      })
      .eq("id", listingId)
      .eq("seller_id", user.id);

    if (error) {
      console.error("[pixel-dispatch] update failed", error);
      return Response.json({ error: "update_failed" }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    // Deliberately not reported to Sentry. A probe that pages us when it fails
    // is worse than the missing data point it is trying to collect.
    console.error("[pixel-dispatch] unexpected", err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
