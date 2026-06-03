import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Pencil } from "lucide-react";
import { getAdminClientOrRedirect } from "@/lib/admin-page";
import { AdminServiceRoleNotice } from "@/components/admin-service-role-notice";
import { formatCents, PARTNER_STATUS_BADGE } from "@/lib/partner";
import type {
  PartnerProgram,
  PartnerProgramStats,
  PartnerPayout,
  PartnerStatus,
} from "@/types/database";
import { MemberVerifyToggle } from "./member-verify-toggle";
import { ExportButton } from "./export-button";
import { RecordPayoutModal } from "./record-payout-modal";
import { TransactionsPanel, type PartnerTxRow } from "./transactions-panel";

export const dynamic = "force-dynamic";

interface MemberRow {
  id: string;
  full_name: string | null;
  email: string;
  city: string | null;
  partner_verified: boolean | null;
  created_at: string;
}

interface TxFetchRow {
  id: string;
  created_at: string;
  seller_id: string;
  gross_sale_amount: number;
  platform_fee_amount: number;
  attributed_amount: number;
  payout_status: PartnerTxRow["payout_status"];
  seller: { full_name: string | null } | null;
}

export default async function PartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await getAdminClientOrRedirect();
  if (!admin) return <AdminServiceRoleNotice />;
  const { id } = await params;

  const [partnerRes, statsRes, membersRes, txRes, payoutsRes] =
    await Promise.all([
      admin.from("partner_programs").select("*").eq("id", id).maybeSingle(),
      admin.from("partner_program_stats").select("*").eq("id", id).maybeSingle(),
      admin
        .from("users")
        .select("id, full_name, email, city, partner_verified, created_at")
        .eq("partner_program_id", id)
        .order("created_at", { ascending: false }),
      admin
        .from("partner_transactions")
        .select(
          "id, created_at, seller_id, gross_sale_amount, platform_fee_amount, attributed_amount, payout_status, seller:users!seller_id(full_name)",
        )
        .eq("partner_program_id", id)
        .order("created_at", { ascending: false }),
      admin
        .from("partner_payouts")
        .select("*")
        .eq("partner_program_id", id)
        .order("period_end", { ascending: false }),
    ]);

  const partner = partnerRes.data as PartnerProgram | null;
  if (!partner) notFound();

  const stats = (statsRes.data as PartnerProgramStats | null) ?? null;
  const members = (membersRes.data ?? []) as MemberRow[];
  const txns = (txRes.data ?? []) as unknown as TxFetchRow[];
  const payouts = (payoutsRes.data ?? []) as PartnerPayout[];

  // Per-seller transaction counts for the members table.
  const txCountBySeller = new Map<string, number>();
  for (const t of txns) {
    txCountBySeller.set(
      t.seller_id,
      (txCountBySeller.get(t.seller_id) ?? 0) + 1,
    );
  }

  const txRows: PartnerTxRow[] = txns.map((t) => ({
    id: t.id,
    created_at: t.created_at,
    seller_name: t.seller?.full_name ?? "",
    gross_sale_amount: t.gross_sale_amount,
    platform_fee_amount: t.platform_fee_amount,
    attributed_amount: t.attributed_amount,
    payout_status: t.payout_status,
  }));

  const pendingTransactions = txns
    .filter((t) => t.payout_status === "pending")
    .map((t) => ({
      created_at: t.created_at,
      attributed_amount: t.attributed_amount,
    }));

  const badge = PARTNER_STATUS_BADGE[partner.status as PartnerStatus];

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Link
          href="/admin/partners"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Partner Programs
        </Link>

        {/* A. HEADER */}
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-heading text-2xl font-bold text-navy">
                {partner.name}
              </h1>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
              >
                {badge.label}
              </span>
            </div>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              /{partner.slug}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ExportButton partnerId={partner.id} />
            <Link
              href={`/${partner.slug}`}
              target="_blank"
              className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold text-navy transition hover:bg-gray-50"
            >
              <ExternalLink className="h-4 w-4" /> View Landing Page
            </Link>
            <Link
              href={`/admin/partners/${partner.id}/edit`}
              className="inline-flex items-center gap-2 rounded-full bg-orange px-4 py-2 text-sm font-bold text-white transition hover:opacity-90"
            >
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          </div>
        </div>

        {/* B. KEY STATS */}
        <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label="Verified members"
            value={String(stats?.verified_members ?? 0)}
          />
          <StatCard
            label="Pending payout"
            value={formatCents(stats?.pending_payout ?? 0)}
          />
          <StatCard
            label="Lifetime paid out"
            value={formatCents(stats?.total_paid_out ?? 0)}
          />
          <StatCard
            label="Lifetime gross sales"
            value={formatCents(stats?.lifetime_gross_sales ?? 0)}
          />
        </div>

        {/* C. PROGRAM DETAILS */}
        <Panel title="Program Details">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            <Detail label="Slug" value={`/${partner.slug}`} mono />
            <Detail label="Legal name" value={partner.legal_name} />
            <Detail
              label="Nonprofit"
              value={partner.is_nonprofit ? "Yes" : "No"}
            />
            <Detail label="EIN" value={partner.ein} />
            <Detail
              label="Revenue share"
              value={`${partner.rev_share_percent}% of platform fees`}
            />
            <Detail
              label="Badge"
              value={
                partner.badge_text ? (
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
                    style={{ backgroundColor: partner.badge_color ?? "#ff6b35" }}
                  >
                    {partner.badge_text}
                  </span>
                ) : null
              }
            />
            <Detail label="Contact name" value={partner.contact_name} />
            <Detail label="Contact email" value={partner.contact_email} />
            <Detail label="Contact phone" value={partner.contact_phone} />
            <Detail label="Start date" value={partner.start_date} />
            <Detail label="End date" value={partner.end_date} />
            {partner.notes && (
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Notes
                </dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm text-navy">
                  {partner.notes}
                </dd>
              </div>
            )}
          </dl>
        </Panel>

        {/* D. MEMBERS */}
        <Panel title={`Members (${members.length})`}>
          {members.length === 0 ? (
            <EmptyRow text="No members tagged to this partner yet." />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">City</th>
                    <th className="px-3 py-2 text-right">Transactions</th>
                    <th className="px-3 py-2">Joined</th>
                    <th className="px-3 py-2">Verified</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {members.map((m) => (
                    <tr key={m.id}>
                      <td className="px-3 py-2 font-medium text-navy">
                        {m.full_name || "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {m.email}
                      </td>
                      <td className="px-3 py-2">{m.city || "—"}</td>
                      <td className="px-3 py-2 text-right">
                        {txCountBySeller.get(m.id) ?? 0}
                      </td>
                      <td className="px-3 py-2">
                        {m.created_at.slice(0, 10)}
                      </td>
                      <td className="px-3 py-2">
                        <MemberVerifyToggle
                          partnerId={partner.id}
                          userId={m.id}
                          verified={Boolean(m.partner_verified)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* E. TRANSACTIONS */}
        <Panel title={`Transactions (${txRows.length})`}>
          <TransactionsPanel rows={txRows} />
        </Panel>

        {/* F. PAYOUTS */}
        <Panel
          title={`Payouts (${payouts.length})`}
          action={
            <RecordPayoutModal
              partnerId={partner.id}
              pendingTransactions={pendingTransactions}
            />
          }
        >
          {payouts.length === 0 ? (
            <EmptyRow text="No payouts recorded yet." />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Period</th>
                    <th className="px-3 py-2 text-right">Total Attributed</th>
                    <th className="px-3 py-2 text-right">Paid</th>
                    <th className="px-3 py-2">Method</th>
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2">Paid Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {payouts.map((p) => (
                    <tr key={p.id}>
                      <td className="px-3 py-2">
                        {p.period_start} → {p.period_end}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatCents(p.total_attributed)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">
                        {formatCents(p.payout_amount)}
                      </td>
                      <td className="px-3 py-2 capitalize">
                        {p.payout_method || "—"}
                      </td>
                      <td className="px-3 py-2">{p.payout_reference || "—"}</td>
                      <td className="px-3 py-2">
                        {p.paid_at ? p.paid_at.slice(0, 10) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-heading text-2xl font-bold text-navy">{value}</p>
    </div>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6 rounded-xl border bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-heading text-sm font-bold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className={`mt-0.5 text-sm text-navy ${mono ? "font-mono" : ""}`}>
        {value || <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed bg-gray-50 px-4 py-8 text-center text-sm text-muted-foreground">
      {text}
    </p>
  );
}
