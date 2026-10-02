import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { countPromotionListings, promotionOpen } from "@/lib/giveaway";

/**
 * GET /api/giveaway/status — is the $500 bat drawing open?
 *
 * Read by the site-header "Win a $500 bat" link and by /giveaway itself. Both
 * are client-side: /giveaway is deliberately static (ad clicks are served from
 * the edge without touching Supabase), and the navbar is a client component.
 * The ENTRY ROUTE does not use this — it enforces the same rule server-side,
 * against its own fresh count, because that is the check that has to be right.
 *
 * Returns { open: true | false | null } and nothing else. null means the count
 * could not be read: the header hides on it (never advertise a drawing that
 * may be closed) but /giveaway keeps its form (saying "closed" would be
 * untrue, and the entry route refuses safely anyway). No count in the body:
 * neither caller needs it, and a public number is one more thing to keep
 * honest.
 *
 * CDN-cached for five minutes, so the header costs one count query per five
 * minutes rather than one per page view. A failed read answers null and is
 * cached for only 30 seconds, so a blip does not hide the link for long.
 *
 * force-dynamic: route handlers run at request time by default here, but
 * prerendering this at build would freeze the answer at deploy time. Explicit
 * so a later config change cannot do that silently.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const admin = createAdminSupabaseClient();
  const count = admin ? await countPromotionListings(admin) : null;
  const known = count !== null;
  const open = known ? promotionOpen(count) : null;

  return Response.json(
    { open },
    {
      headers: {
        "Cache-Control": known
          ? "public, s-maxage=300, stale-while-revalidate=60"
          : "public, s-maxage=30",
      },
    },
  );
}
