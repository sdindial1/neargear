import Link from "next/link";
import Image from "next/image";
import { getAdminClientOrRedirect } from "@/lib/admin-page";
import { AdminServiceRoleNotice } from "@/components/admin-service-role-notice";
import { ModerationActions } from "@/components/admin/moderation-actions";
import { ArrowLeft, ShieldAlert, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * /admin/moderation — the review queue.
 *
 * Two lists, and the second one matters as much as the first:
 *
 *   HELD    listings the classifier sent to review. Invisible to buyers, and
 *           earning no sweepstakes entry, until approved. This is the queue.
 *   SWEEP   listings that published with verdict 'error' — the classifier was
 *           down and the listing went live anyway (fail-open, see
 *           src/lib/moderation/classify.ts). Nobody has ever looked at these.
 *           They are LIVE right now, which is why they are on this page and
 *           not in a log file somewhere.
 *
 * Held listings are the urgent-feeling list but the low-stakes one — a seller
 * is waiting. The sweep list is the opposite: nobody is waiting, and it is the
 * one that can have something bad on the marketplace.
 */
export default async function AdminModerationPage() {
  const admin = await getAdminClientOrRedirect();
  if (!admin) return <AdminServiceRoleNotice />;

  const select =
    "id, title, sport, category, price, description, photo_urls, created_at, " +
    "status, moderation_verdict, moderation_reasons, moderation_confidence, " +
    "seller:users!seller_id(full_name, email)";

  const [heldRes, sweepRes, recentRes] = await Promise.all([
    admin
      .from("listings")
      .select(select)
      .eq("status", "pending_review")
      .order("created_at", { ascending: true }),
    admin
      .from("listings")
      .select(select)
      .eq("moderation_verdict", "error")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(50),
    // Blocked submissions never became listings, so this table is the only
    // record they happened. Volume here is the signal that the gate is being
    // probed rather than just used.
    admin
      .from("moderation_events")
      .select("id, verdict, source, reasons, title, created_at")
      .in("verdict", ["block", "review"])
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  type Row = {
    id: string;
    title: string | null;
    sport: string | null;
    category: string | null;
    price: number | null;
    description: string | null;
    photo_urls: string[] | null;
    created_at: string;
    moderation_verdict: string | null;
    moderation_reasons: string[] | null;
    moderation_confidence: number | null;
    seller: { full_name: string | null; email: string } | { full_name: string | null; email: string }[] | null;
  };

  const norm = (rows: unknown): Row[] =>
    ((rows ?? []) as Row[]).map((r) => ({
      ...r,
      seller: Array.isArray(r.seller) ? (r.seller[0] ?? null) : r.seller,
    }));

  const held = norm(heldRes.data);
  const sweep = norm(sweepRes.data);
  const events = (recentRes.data ?? []) as Array<{
    id: string;
    verdict: string;
    source: string;
    reasons: string[];
    title: string | null;
    created_at: string;
  }>;

  const err = heldRes.error || sweepRes.error || recentRes.error;

  const card = (r: Row, mode: "held" | "sweep") => {
    const seller = Array.isArray(r.seller) ? r.seller[0] : r.seller;
    return (
      <div key={r.id} className="rounded-2xl border bg-white p-4">
        <div className="flex gap-4">
          {r.photo_urls?.[0] ? (
            <div className="relative h-28 w-28 flex-shrink-0 overflow-hidden rounded-xl bg-gray-100">
              <Image
                src={r.photo_urls[0]}
                alt={r.title ?? "Listing photo"}
                fill
                sizes="112px"
                className="object-cover"
                unoptimized
              />
            </div>
          ) : (
            <div className="flex h-28 w-28 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100 text-xs text-muted-foreground">
              no photo
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/listings/${r.id}`}
                className="font-heading font-bold text-navy hover:underline"
              >
                {r.title ?? "(untitled)"}
              </Link>
              <span className="text-sm text-muted-foreground">
                ${((r.price ?? 0) / 100).toFixed(0)}
              </span>
            </div>

            <p className="mt-0.5 text-xs text-muted-foreground">
              {r.sport || "(no sport)"} / {r.category || "(no category)"} &middot;{" "}
              {seller?.full_name ?? "(unknown)"} &middot; {seller?.email ?? "—"}
            </p>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {(r.moderation_reasons ?? []).length === 0 ? (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-muted-foreground">
                  no reason recorded
                </span>
              ) : (
                (r.moderation_reasons ?? []).map((reason) => (
                  <span
                    key={reason}
                    className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 border border-amber-200"
                  >
                    {reason}
                  </span>
                ))
              )}
              {r.moderation_confidence != null && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-muted-foreground">
                  confidence {r.moderation_confidence}
                </span>
              )}
            </div>

            {r.description && (
              <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                {r.description}
              </p>
            )}

            <div className="mt-3">
              <ModerationActions listingId={r.id} mode={mode} />
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Link
          href="/admin"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Admin
        </Link>

        <div className="mb-6 flex items-start gap-3">
          <ShieldAlert className="mt-1 h-6 w-6 text-orange" />
          <div>
            <h1 className="font-heading text-2xl font-bold text-navy">
              Listing moderation
            </h1>
            <p className="text-sm text-muted-foreground">
              Held listings are invisible to buyers and earn no giveaway entry
              until approved.
            </p>
          </div>
        </div>

        {err && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            Query failed: {err.message}
          </div>
        )}

        {/* ---- Sweep first: these are LIVE and unreviewed ---- */}
        {sweep.length > 0 && (
          <section className="mb-8">
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
              <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-700" />
              <p className="text-sm text-red-900">
                <strong>{sweep.length} listing(s) published without a check.</strong>{" "}
                The classifier was unavailable and these went live anyway so the
                queue wouldn&apos;t stall. They are visible to buyers right now.
              </p>
            </div>
            <div className="space-y-3">{sweep.map((r) => card(r, "sweep"))}</div>
          </section>
        )}

        {/* ---- The queue ---- */}
        <section className="mb-8">
          <h2 className="mb-3 font-heading text-lg font-bold text-navy">
            Awaiting review{held.length > 0 && ` (${held.length})`}
          </h2>
          {held.length === 0 ? (
            <div className="rounded-2xl border bg-white p-8 text-center">
              <p className="font-heading font-semibold text-navy">
                Nothing waiting
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Every listing submitted so far published automatically.
              </p>
            </div>
          ) : (
            <div className="space-y-3">{held.map((r) => card(r, "held"))}</div>
          )}
        </section>

        {/* ---- Recent verdicts, including blocks with no listing row ---- */}
        <section className="rounded-2xl border bg-white p-5">
          <h2 className="mb-1 font-heading text-lg font-bold text-navy">
            Recent blocks &amp; holds
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Includes refused submissions that never became listings. Watch the
            volume here — a spike means the gate is being probed.
          </p>
          {events.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No blocks or holds recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-4">When</th>
                    <th className="py-2 pr-4">Verdict</th>
                    <th className="py-2 pr-4">Source</th>
                    <th className="py-2 pr-4">Item</th>
                    <th className="py-2">Reasons</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id} className="border-b last:border-0 align-top">
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {new Date(e.created_at).toLocaleString()}
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className={
                            e.verdict === "block"
                              ? "font-semibold text-red-700"
                              : "font-semibold text-amber-800"
                          }
                        >
                          {e.verdict}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {e.source}
                      </td>
                      <td className="py-2 pr-4">{e.title ?? "—"}</td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {(e.reasons ?? []).join(", ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
