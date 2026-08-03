import Link from "next/link";
import { getAdminClientOrRedirect } from "@/lib/admin-page";
import { AdminServiceRoleNotice } from "@/components/admin-service-role-notice";
import { DisputeActions } from "@/components/admin/dispute-actions";
import { AlertTriangle, ArrowLeft, Scale } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * /admin/disputes — the review queue for every frozen order.
 *
 * ORDER-DRIVEN, deliberately. The queue is "orders with disputed_at set that
 * are still holding funds", not "meetups with status = item_dispute". That one
 * query covers item disputes, buyer cancels inside 24h and buyer no-shows, and
 * it does not depend on meetups.status — which is what the old read-only
 * disputes panel keyed on, and why it was always empty.
 */

const FREEZE_LABEL: Record<string, { label: string; hint: string }> = {
  item_dispute: {
    label: "Item dispute",
    hint: "Buyer reported a problem with the item.",
  },
  cancelled_late: {
    label: "Late cancellation",
    hint: "Buyer cancelled within 24 hours of the meetup.",
  },
  no_show: {
    label: "No-show",
    hint: "One party didn't turn up.",
  },
  cancelled: {
    label: "Cancelled",
    hint: "Cancelled — normally auto-refunded, so review why this is held.",
  },
};

interface QueueRow {
  id: string;
  status: string;
  disputed_at: string | null;
  freeze_reason: string | null;
  item_price_cents: number;
  seller_fee_cents: number;
  gross_captured_cents: number;
  stripe_transfer_id: string | null;
  meetup_id: string | null;
  meetup: {
    status: string;
    item_dispute_reason: string | null;
    item_dispute_notes: string | null;
  } | null;
  listing: { title: string } | null;
  buyer: { full_name: string | null; email: string } | null;
  seller: { full_name: string | null; email: string } | null;
}

const SELECT =
  "id, status, disputed_at, freeze_reason, item_price_cents, seller_fee_cents, " +
  "gross_captured_cents, stripe_transfer_id, meetup_id, " +
  "meetup:meetups!meetup_id(status, item_dispute_reason, item_dispute_notes), " +
  "listing:listings!listing_id(title), " +
  "buyer:users!buyer_id(full_name, email), " +
  "seller:users!seller_id(full_name, email)";

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function AdminDisputesPage() {
  const admin = await getAdminClientOrRedirect();
  if (!admin) return <AdminServiceRoleNotice />;

  // Open cases: frozen AND still holding funds.
  const { data: openData, error: openErr } = await admin
    .from("orders")
    .select(SELECT)
    .not("disputed_at", "is", null)
    .in("status", ["paid_held", "release_failed"])
    .order("disputed_at", { ascending: true });

  // Money already gone, then reported — refundOrder refuses these, so they need
  // a manual reversal in Stripe. Surfaced so they can't hide.
  const { data: reversalData } = await admin
    .from("orders")
    .select(SELECT)
    .not("disputed_at", "is", null)
    .eq("status", "released")
    .order("disputed_at", { ascending: false });

  const normalise = (rows: unknown): QueueRow[] =>
    ((rows ?? []) as unknown[]).map((r) => {
      const row = r as QueueRow;
      return {
        ...row,
        meetup: one(row.meetup),
        listing: one(row.listing),
        buyer: one(row.buyer),
        seller: one(row.seller),
      };
    });

  const open = normalise(openData);
  const reversals = normalise(reversalData);
  const heldTotal = open.reduce((a, r) => a + r.gross_captured_cents, 0);

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Link
          href="/admin"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Admin
        </Link>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold text-navy">
              Disputes &amp; held funds
            </h1>
            <p className="text-sm text-muted-foreground">
              Every frozen order waiting on a decision. Each resolves one way or
              the other — full refund to the buyer, or full payout to the seller.
            </p>
          </div>
          <div className="rounded-xl border bg-white px-4 py-3 text-right">
            <p className="text-xs text-muted-foreground">Held pending review</p>
            <p className="font-heading text-xl font-bold text-navy">
              {money(heldTotal)}
            </p>
            <p className="text-xs text-muted-foreground">
              {open.length} {open.length === 1 ? "case" : "cases"}
            </p>
          </div>
        </div>

        {openErr && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            Couldn&apos;t load the queue: {openErr.message}
          </div>
        )}

        {open.length === 0 && !openErr && (
          <div className="rounded-2xl border bg-white p-10 text-center">
            <Scale className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-heading text-lg font-bold text-navy">
              Nothing waiting
            </p>
            <p className="text-sm text-muted-foreground">
              Cancels outside 24 hours and seller no-shows refund automatically
              and never reach this queue.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {open.map((row) => {
            const meta = FREEZE_LABEL[row.freeze_reason ?? ""] ?? {
              label: row.freeze_reason ?? "Held",
              hint: "",
            };
            const payout = row.item_price_cents - row.seller_fee_cents;
            const buyerName = row.buyer?.full_name || row.buyer?.email || "the buyer";
            const sellerName =
              row.seller?.full_name || row.seller?.email || "the seller";

            return (
              <section key={row.id} className="rounded-2xl border bg-white p-5">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-orange/10 px-2.5 py-0.5 text-xs font-semibold text-orange">
                        {meta.label}
                      </span>
                      {row.status === "release_failed" && (
                        <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                          payout failed
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        meetup {row.meetup?.status ?? "—"}
                      </span>
                    </div>
                    <h2 className="font-heading text-lg font-bold text-navy">
                      {row.listing?.title ?? "Item"}
                    </h2>
                    <p className="text-sm text-muted-foreground">{meta.hint}</p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-heading text-lg font-bold text-navy">
                      {money(row.gross_captured_cents)}
                    </p>
                    <p className="text-xs text-muted-foreground">held</p>
                  </div>
                </div>

                {row.meetup?.item_dispute_reason && (
                  <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm font-semibold text-amber-900">
                      {row.meetup.item_dispute_reason}
                    </p>
                    {row.meetup.item_dispute_notes && (
                      <p className="mt-1 text-sm text-amber-900">
                        “{row.meetup.item_dispute_notes}”
                      </p>
                    )}
                  </div>
                )}

                <dl className="mb-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  <div className="flex justify-between sm:block">
                    <dt className="text-muted-foreground">Buyer</dt>
                    <dd className="font-medium text-navy">
                      {buyerName}
                      {row.buyer?.email && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          {row.buyer.email}
                        </span>
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between sm:block">
                    <dt className="text-muted-foreground">Seller</dt>
                    <dd className="font-medium text-navy">
                      {sellerName}
                      {row.seller?.email && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          {row.seller.email}
                        </span>
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between sm:block">
                    <dt className="text-muted-foreground">Refund to buyer</dt>
                    <dd className="font-medium text-navy">
                      {money(row.gross_captured_cents)} (incl. buyer fee)
                    </dd>
                  </div>
                  <div className="flex justify-between sm:block">
                    <dt className="text-muted-foreground">Payout to seller</dt>
                    <dd className="font-medium text-navy">
                      {money(payout)} (after {money(row.seller_fee_cents)} fee)
                    </dd>
                  </div>
                  <div className="flex justify-between sm:block">
                    <dt className="text-muted-foreground">Held since</dt>
                    <dd className="font-medium text-navy">
                      {row.disputed_at
                        ? new Date(row.disputed_at).toLocaleString("en-US")
                        : "—"}
                    </dd>
                  </div>
                  {row.meetup_id && (
                    <div className="flex justify-between sm:block">
                      <dt className="text-muted-foreground">Meetup</dt>
                      <dd>
                        <Link
                          href={`/meetups/${row.meetup_id}`}
                          className="font-medium text-orange hover:underline"
                        >
                          View
                        </Link>
                      </dd>
                    </div>
                  )}
                </dl>

                <DisputeActions
                  orderId={row.id}
                  refundAmountCents={row.gross_captured_cents}
                  payoutAmountCents={payout}
                  buyerName={buyerName}
                  sellerName={sellerName}
                />
              </section>
            );
          })}
        </div>

        {reversals.length > 0 && (
          <section className="mt-10">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <h2 className="font-heading text-lg font-bold text-navy">
                Needs manual reversal ({reversals.length})
              </h2>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              Reported <em>after</em> the payout already went out. These can&apos;t
              be refunded from here — reverse the transfer in the Stripe
              dashboard, then decide whether to recover from the seller.
            </p>
            <div className="space-y-3">
              {reversals.map((row) => (
                <div
                  key={row.id}
                  className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-red-900">
                      {row.listing?.title ?? "Item"} —{" "}
                      {money(row.item_price_cents - row.seller_fee_cents)} paid
                      to {row.seller?.full_name || row.seller?.email || "seller"}
                    </p>
                    <code className="rounded bg-white px-2 py-0.5 text-xs text-red-900">
                      {row.stripe_transfer_id ?? "no transfer id"}
                    </code>
                  </div>
                  <p className="mt-1 text-red-800">
                    {FREEZE_LABEL[row.freeze_reason ?? ""]?.label ??
                      row.freeze_reason}{" "}
                    · buyer {row.buyer?.email ?? "—"}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
