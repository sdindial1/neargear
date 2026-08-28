import Link from "next/link";
import { getAdminClientOrRedirect } from "@/lib/admin-page";
import { AdminServiceRoleNotice } from "@/components/admin-service-role-notice";
import { loadFunnel, loadSignups, loadBySource } from "@/lib/funnel";
import { ArrowLeft, TrendingDown, Users } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * /admin/signups — where people leave.
 *
 * Read-only. Reuses getAdminClientOrRedirect(), which is the same allowlist gate
 * every other admin page uses — there is no second auth path here.
 *
 * Every count excludes seed listings and founder accounts, and the rules are
 * printed on the page rather than left implicit. A funnel whose definitions live
 * only in the code is a funnel two people will read differently.
 */
export default async function AdminSignupsPage() {
  const admin = await getAdminClientOrRedirect();
  if (!admin) return <AdminServiceRoleNotice />;

  const [{ steps, biggestDrop }, signups, bySource] = await Promise.all([
    loadFunnel(admin, 30),
    loadSignups(admin, 30),
    loadBySource(admin, 30),
  ]);

  const zeroListing = signups.filter((s) => !s.is_founder && s.listings_count === 0);
  const fmtDate = (d: string) => new Date(d).toLocaleDateString();
  const ago = (d: string) => {
    const h = (Date.now() - Date.parse(d)) / 3_600_000;
    if (h < 24) return `${Math.round(h)}h ago`;
    return `${Math.round(h / 24)}d ago`;
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Link
          href="/admin"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Admin
        </Link>

        <div className="mb-6 flex items-start gap-3">
          <Users className="mt-1 h-6 w-6 text-orange" />
          <div>
            <h1 className="font-heading text-2xl font-bold text-navy">
              Signups &amp; funnel
            </h1>
            <p className="text-sm text-muted-foreground">
              Last 30 days. Excludes seed listings and founder accounts —{" "}
              <span className="font-medium">
                real account = not a founder and not a demo account; real listing
                = source &lsquo;organic&rsquo; posted by a real account.
              </span>
            </p>
          </div>
        </div>

        {/* ---- Funnel ---- */}
        <section className="mb-8 rounded-2xl border bg-white p-5">
          <h2 className="mb-1 font-heading text-lg font-bold text-navy">Funnel</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Each percentage is conversion from the step above it.
          </p>
          <div className="space-y-2">
            {steps.map((s, i) => (
              <div
                key={s.key}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border bg-gray-50 px-4 py-3"
              >
                <div>
                  <p className="font-heading font-semibold text-navy">{s.label}</p>
                  <p className="text-xs text-muted-foreground">{s.note}</p>
                </div>
                <div className="flex items-baseline gap-4">
                  {s.fromPrevPct != null && (
                    <span
                      className={`text-sm font-semibold ${
                        i < 3 && s.fromPrevPct < 25 ? "text-red-700" : "text-muted-foreground"
                      }`}
                    >
                      {s.fromPrevPct}%
                    </span>
                  )}
                  <span className="font-heading text-2xl font-bold tabular-nums text-navy">
                    {s.count}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <TrendingDown className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-800" />
            <p className="text-sm text-amber-900">
              <strong>Biggest drop-off:</strong> {biggestDrop}
            </p>
          </div>
        </section>

        {/* ---- By source ---- */}
        <section className="mb-8 rounded-2xl border bg-white p-5">
          <h2 className="mb-1 font-heading text-lg font-bold text-navy">
            By traffic source
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Paid vs organic. Sources come from utm_source captured at first touch;
            &ldquo;(direct / unknown)&rdquo; means no campaign parameters were
            present, which is also what every signup before 2026-08-26 shows.
          </p>
          {bySource.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No traffic recorded in this window yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-4">Source</th>
                    <th className="py-2 pr-4 text-right">Views</th>
                    <th className="py-2 pr-4 text-right">Signups</th>
                    <th className="py-2 pr-4 text-right">Listed</th>
                    <th className="py-2 text-right">Listings</th>
                  </tr>
                </thead>
                <tbody>
                  {bySource.map((r) => (
                    <tr key={r.source} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium text-navy">{r.source}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{r.views}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{r.signups}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{r.listers}</td>
                      <td className="py-2 text-right tabular-nums">{r.listings}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ---- Signups ---- */}
        <section className="rounded-2xl border bg-white p-5">
          <div className="mb-4">
            <h2 className="font-heading text-lg font-bold text-navy">
              Signups ({signups.length})
            </h2>
            <p className="text-sm text-muted-foreground">
              <strong className="text-red-700">
                {zeroListing.length} with zero listings
              </strong>{" "}
              — that cohort is the problem this page exists to see.
            </p>
          </div>

          {signups.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No signups in the last 30 days.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3">Signed up</th>
                    <th className="py-2 pr-3">Source</th>
                    <th className="py-2 pr-3 text-right">Listings</th>
                    <th className="py-2 pr-3">First listing</th>
                    <th className="py-2 pr-3 text-right">Days to list</th>
                    <th className="py-2">Terms</th>
                  </tr>
                </thead>
                <tbody>
                  {signups.map((s) => {
                    const stalled = !s.is_founder && s.listings_count === 0;
                    return (
                      <tr
                        key={s.id}
                        className={`border-b last:border-0 ${stalled ? "bg-red-50/40" : ""}`}
                      >
                        <td className="py-2 pr-3">
                          <span className="font-medium text-navy">{s.email}</span>
                          {s.is_founder && (
                            <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                              founder
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {fmtDate(s.created_at)}
                          <span className="ml-1 text-xs">({ago(s.created_at)})</span>
                        </td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground">
                          {s.utm_source ? (
                            <>
                              {s.utm_source}
                              {s.utm_medium ? ` / ${s.utm_medium}` : ""}
                              {s.utm_campaign ? ` / ${s.utm_campaign}` : ""}
                            </>
                          ) : (
                            <span className="italic">unknown</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {stalled ? (
                            <span className="font-semibold text-red-700">0</span>
                          ) : (
                            s.listings_count
                          )}
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {s.first_listing_at ? fmtDate(s.first_listing_at) : "—"}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                          {s.days_to_first_listing ?? "—"}
                        </td>
                        <td className="py-2">
                          {s.terms_accepted_at ? (
                            <span className="text-[11px] text-muted-foreground">
                              recorded
                            </span>
                          ) : (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                              none
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
