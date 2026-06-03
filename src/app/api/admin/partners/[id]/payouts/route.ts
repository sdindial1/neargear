import * as Sentry from "@sentry/nextjs";
import { requireAdmin } from "@/lib/admin-guard";
import { emptyToNull } from "@/lib/partner";

const ALLOWED_METHODS = ["check", "ach", "wire", "other"];

// POST /api/admin/partners/[id]/payouts — record a payout for a period.
// Sums all PENDING partner_transactions in [period_start, period_end], creates
// a partner_payouts row, and marks those transactions 'paid' (linked to it).
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
    const { admin, user } = guard;
    const { id: partnerId } = await context.params;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return Response.json({ error: "Invalid body" }, { status: 400 });
    }

    const periodStart =
      typeof body.period_start === "string" ? body.period_start : "";
    const periodEnd =
      typeof body.period_end === "string" ? body.period_end : "";
    if (!periodStart || !periodEnd) {
      return Response.json(
        { error: "Period start and end are required" },
        { status: 400 },
      );
    }
    if (periodStart > periodEnd) {
      return Response.json(
        { error: "Period start must be on or before period end" },
        { status: 400 },
      );
    }

    const payoutAmount = Number(body.payout_amount);
    if (Number.isNaN(payoutAmount) || payoutAmount < 0) {
      return Response.json(
        { error: "Payout amount must be a non-negative number (cents)" },
        { status: 400 },
      );
    }

    const method =
      typeof body.payout_method === "string" &&
      ALLOWED_METHODS.includes(body.payout_method)
        ? body.payout_method
        : null;

    // Pending transactions in range (inclusive of the whole end day).
    const { data: pending, error: txError } = await admin
      .from("partner_transactions")
      .select("id, gross_sale_amount, platform_fee_amount, attributed_amount")
      .eq("partner_program_id", partnerId)
      .eq("payout_status", "pending")
      .gte("created_at", `${periodStart}T00:00:00.000Z`)
      .lte("created_at", `${periodEnd}T23:59:59.999Z`);

    if (txError) {
      console.error("[admin partner payout] fetch tx", txError);
      Sentry.captureException(txError);
      return Response.json({ error: "Something went wrong" }, { status: 500 });
    }

    const rows = pending ?? [];
    const totals = rows.reduce(
      (acc, r) => ({
        gross: acc.gross + (r.gross_sale_amount ?? 0),
        fees: acc.fees + (r.platform_fee_amount ?? 0),
        attributed: acc.attributed + (r.attributed_amount ?? 0),
      }),
      { gross: 0, fees: 0, attributed: 0 },
    );

    const { data: payout, error: payoutError } = await admin
      .from("partner_payouts")
      .insert({
        partner_program_id: partnerId,
        period_start: periodStart,
        period_end: periodEnd,
        total_gross_sales: totals.gross,
        total_platform_fees: totals.fees,
        total_attributed: totals.attributed,
        payout_amount: Math.round(payoutAmount),
        payout_method: method,
        payout_reference: emptyToNull(body.payout_reference),
        paid_at: new Date().toISOString(),
        paid_by_admin_id: user.id,
        notes: emptyToNull(body.notes),
      })
      .select("id")
      .single();

    if (payoutError) {
      console.error("[admin partner payout] insert", payoutError);
      Sentry.captureException(payoutError);
      return Response.json({ error: "Something went wrong" }, { status: 500 });
    }

    // Mark the covered transactions paid and link them to this payout.
    if (rows.length > 0) {
      const { error: markError } = await admin
        .from("partner_transactions")
        .update({ payout_status: "paid", partner_payout_id: payout.id })
        .in(
          "id",
          rows.map((r) => r.id),
        );

      if (markError) {
        console.error("[admin partner payout] mark paid", markError);
        Sentry.captureException(markError);
        // The payout row exists but transactions weren't flipped. Surface it so
        // the admin can retry/reconcile rather than silently double-paying.
        return Response.json(
          {
            error:
              "Payout recorded, but marking transactions paid failed. Reconcile manually.",
            payout_id: payout.id,
          },
          { status: 500 },
        );
      }
    }

    return Response.json(
      { id: payout.id, transactions_marked: rows.length },
      { status: 201 },
    );
  } catch (err) {
    console.error("[admin partner payout] unexpected", err);
    Sentry.captureException(err);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}
