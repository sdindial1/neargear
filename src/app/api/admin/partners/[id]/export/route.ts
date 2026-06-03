import * as Sentry from "@sentry/nextjs";
import { requireAdmin } from "@/lib/admin-guard";

// GET /api/admin/partners/[id]/export?start=YYYY-MM-DD&end=YYYY-MM-DD
// Returns a CSV of this partner's attributed transactions in the date range.
// Columns: Date, Seller, Buyer, Sale Amount, Platform Fee, Attributed Amount,
// Payout Status. Amounts are rendered in dollars.
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
    const { admin } = guard;
    const { id: partnerId } = await context.params;

    const url = new URL(request.url);
    const start = url.searchParams.get("start") || "1970-01-01";
    const end = url.searchParams.get("end") || new Date().toISOString().slice(0, 10);

    const { data: partner } = await admin
      .from("partner_programs")
      .select("slug")
      .eq("id", partnerId)
      .maybeSingle();
    const slug = partner?.slug ?? "partner";

    const { data: txns, error } = await admin
      .from("partner_transactions")
      .select(
        "transaction_id, gross_sale_amount, platform_fee_amount, attributed_amount, payout_status, created_at, seller:users!seller_id(full_name)",
      )
      .eq("partner_program_id", partnerId)
      .gte("created_at", `${start}T00:00:00.000Z`)
      .lte("created_at", `${end}T23:59:59.999Z`)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[admin partner export]", error);
      Sentry.captureException(error);
      return Response.json({ error: "Something went wrong" }, { status: 500 });
    }

    const rows = txns ?? [];

    // Buyer lives on the transactions table (partner_transactions.transaction_id
    // is a bare UUID, no FK to auto-join). Resolve buyer names in two hops.
    const txIds = rows.map((r) => r.transaction_id).filter(Boolean);
    const buyerByTx = new Map<string, string>();
    if (txIds.length > 0) {
      const { data: sourceTx } = await admin
        .from("transactions")
        .select("id, buyer:users!buyer_id(full_name)")
        .in("id", txIds);
      for (const t of sourceTx ?? []) {
        // PostgREST to-one embed: object at runtime, but supabase-js types it
        // as an array — bridge through unknown.
        const buyer = t.buyer as unknown as { full_name: string | null } | null;
        buyerByTx.set(t.id as string, buyer?.full_name ?? "");
      }
    }

    const header = [
      "Date",
      "Seller",
      "Buyer",
      "Sale Amount",
      "Platform Fee",
      "Attributed Amount",
      "Payout Status",
    ];

    const lines = [header.map(csvCell).join(",")];
    for (const r of rows) {
      const seller = r.seller as unknown as { full_name: string | null } | null;
      lines.push(
        [
          (r.created_at as string)?.slice(0, 10) ?? "",
          seller?.full_name ?? "",
          buyerByTx.get(r.transaction_id as string) ?? "",
          dollars(r.gross_sale_amount as number),
          dollars(r.platform_fee_amount as number),
          dollars(r.attributed_amount as number),
          (r.payout_status as string) ?? "",
        ]
          .map(csvCell)
          .join(","),
      );
    }

    const csv = lines.join("\r\n");
    const filename = `${slug}-report-${start}-${end}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("[admin partner export] unexpected", err);
    Sentry.captureException(err);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}

function dollars(cents: number | null | undefined): string {
  return ((cents ?? 0) / 100).toFixed(2);
}

function csvCell(value: string): string {
  // Quote and escape per RFC 4180 so commas/quotes/newlines in names are safe.
  return `"${value.replace(/"/g, '""')}"`;
}
