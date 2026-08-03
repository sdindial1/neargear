import * as Sentry from "@sentry/nextjs";
import { requireAdmin } from "@/lib/admin-guard";
import { resolveDispute } from "@/lib/orders/resolve";
import type { DisputeResolution } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/disputes/[orderId]/resolve   body: { resolution }
 *
 * Admin-only. Thin wrapper around resolveDispute(), which routes to the proven
 * money movers. Auth is server-side via requireAdmin() — the button being
 * hidden in the UI is not a security control.
 *
 * resolution: "refund_buyer" | "release_seller". Binary by design.
 */
const VALID: DisputeResolution[] = ["refund_buyer", "release_seller"];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const { orderId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      resolution?: string;
    };
    const resolution = body.resolution as DisputeResolution;

    if (!VALID.includes(resolution)) {
      return Response.json(
        { error: "invalid_resolution", valid: VALID },
        { status: 400 },
      );
    }

    const result = await resolveDispute(guard.admin, {
      orderId,
      resolution,
      adminUserId: guard.user.id,
    });

    if (!result.ok) {
      return Response.json(
        {
          error: result.error,
          message: result.message,
          transferId: result.transferId,
        },
        { status: result.status },
      );
    }
    return Response.json(result);
  } catch (err) {
    console.error("[admin/disputes/resolve] error", err);
    Sentry.captureException(err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
