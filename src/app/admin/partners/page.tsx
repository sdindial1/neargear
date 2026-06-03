import Link from "next/link";
import { getAdminClientOrRedirect } from "@/lib/admin-page";
import { AdminServiceRoleNotice } from "@/components/admin-service-role-notice";
import {
  formatCents,
  PARTNER_STATUS_BADGE,
  STATUS_SORT_RANK,
} from "@/lib/partner";
import type { PartnerProgramStats, PartnerStatus } from "@/types/database";
import { ArrowLeft, Plus, Users } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PartnersListPage() {
  const admin = await getAdminClientOrRedirect();
  if (!admin) return <AdminServiceRoleNotice />;

  const { data } = await admin.from("partner_program_stats").select("*");
  const stats = ((data ?? []) as PartnerProgramStats[]).sort((a, b) => {
    const rank = STATUS_SORT_RANK[a.status] - STATUS_SORT_RANK[b.status];
    return rank;
  });

  const summary = stats.reduce(
    (acc, s) => ({
      activePartners: acc.activePartners + (s.status === "active" ? 1 : 0),
      verifiedMembers: acc.verifiedMembers + Number(s.verified_members ?? 0),
      pendingPayout: acc.pendingPayout + Number(s.pending_payout ?? 0),
      paidOut: acc.paidOut + Number(s.total_paid_out ?? 0),
    }),
    { activePartners: 0, verifiedMembers: 0, pendingPayout: 0, paidOut: 0 },
  );

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Link
          href="/admin"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Admin
        </Link>

        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-bold text-navy">
              Partner Programs
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage revenue share partnerships with leagues and organizations
            </p>
          </div>
          <Link
            href="/admin/partners/new"
            className="inline-flex items-center gap-2 rounded-full bg-orange px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> New Partner
          </Link>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryCard label="Active partners" value={String(summary.activePartners)} />
          <SummaryCard
            label="Verified members"
            value={String(summary.verifiedMembers)}
          />
          <SummaryCard
            label="Pending payout"
            value={formatCents(summary.pendingPayout)}
          />
          <SummaryCard
            label="Paid out (lifetime)"
            value={formatCents(summary.paidOut)}
          />
        </div>

        {stats.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-white p-12 text-center">
            <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium text-navy">No partner programs yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first partner to start tracking revenue share.
            </p>
            <Link
              href="/admin/partners/new"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-orange px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> New Partner
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Slug</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Members</th>
                  <th className="px-4 py-3 text-right">Pending</th>
                  <th className="px-4 py-3 text-right">Lifetime</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {stats.map((s) => {
                  const badge = PARTNER_STATUS_BADGE[s.status as PartnerStatus];
                  return (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-navy">
                        <Link
                          href={`/admin/partners/${s.id}`}
                          className="hover:underline"
                        >
                          {s.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {s.slug}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {Number(s.verified_members ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatCents(s.pending_payout)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatCents(s.lifetime_attributed)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/partners/${s.id}`}
                          className="text-orange hover:underline"
                        >
                          Manage
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-heading text-2xl font-bold text-navy">{value}</p>
    </div>
  );
}
