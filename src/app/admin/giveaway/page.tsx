import Link from "next/link";
import { getAdminClientOrRedirect } from "@/lib/admin-page";
import { AdminServiceRoleNotice } from "@/components/admin-service-role-notice";
import { GiveawayExport } from "@/components/admin/giveaway-export";
import {
  GIVEAWAY_GOAL,
  PROMOTION_END_ISO,
  PROMOTION_END_LABEL,
  PROMOTION_START_ISO,
  PROMOTION_START_LABEL,
} from "@/lib/giveaway";
import { ArrowLeft, Ticket } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * /admin/giveaway — the drawing audit.
 *
 * Official Rules §7 requires the winner to be drawn from all eligible entries,
 * and §5 lets Sponsor disqualify entries. Both are only defensible if the entry
 * pool can be produced on demand — that is what this page is for.
 *
 * Two pools, drawn together:
 *   Listing entries — one per Qualifying Listing posted during the Promotion
 *                     Period that is STILL ACTIVE. Rules §4.1 requires a
 *                     listing to remain posted through the Entry Deadline, and
 *                     §5 voids the entry if it is removed, so filtering on
 *                     status = 'active' is the rule, not a shortcut.
 *   AMOE entries    — one row per free-entry submission, already limited to one
 *                     per email per Central-time day by a unique index.
 *
 * Service-role only, admin-gated: sweepstakes_entries holds PII and is
 * unreachable by anon or authenticated.
 */
export default async function AdminGiveawayPage() {
  const admin = await getAdminClientOrRedirect();
  if (!admin) return <AdminServiceRoleNotice />;

  // ---- Listing entries -----------------------------------------------------
  const { data: listingRows, error: listingErr } = await admin
    .from("listings")
    .select(
      "id, title, created_at, status, seller_id, " +
        "seller:users!seller_id(full_name, email, sweepstakes_eligible)",
    )
    .eq("status", "active")
    .gte("created_at", PROMOTION_START_ISO)
    .lte("created_at", PROMOTION_END_ISO)
    .order("created_at", { ascending: true });

  type ListingRow = {
    id: string;
    title: string | null;
    created_at: string;
    seller_id: string | null;
    seller:
      | { full_name: string | null; email: string; sweepstakes_eligible: boolean | null }
      | { full_name: string | null; email: string; sweepstakes_eligible: boolean | null }[]
      | null;
  };
  const listings = ((listingRows ?? []) as unknown as ListingRow[]).map((r) => ({
    ...r,
    seller: Array.isArray(r.seller) ? (r.seller[0] ?? null) : r.seller,
  }));

  // Per-user tally: this is the shape you need to draw from, and to spot the
  // pattern §5 calls out — one account posting an implausible number of items.
  const byUser = new Map<
    string,
    { name: string; email: string; count: number; titles: string[]; eligible: boolean }
  >();
  for (const l of listings) {
    const key = l.seller_id ?? "unknown";
    const existing = byUser.get(key) ?? {
      name: l.seller?.full_name ?? "(unknown)",
      email: l.seller?.email ?? "(unknown)",
      count: 0,
      titles: [],
      // Official Rules §2. Sponsor personnel and Sponsor-controlled accounts
      // still appear here as an audit record; they are simply not drawn from.
      eligible: l.seller?.sweepstakes_eligible !== false,
    };
    existing.count += 1;
    existing.titles.push(l.title ?? "(untitled)");
    byUser.set(key, existing);
  }
  const users = [...byUser.entries()].sort((a, b) => b[1].count - a[1].count);

  // ---- AMOE entries --------------------------------------------------------
  const { data: amoeRows, error: amoeErr } = await admin
    .from("sweepstakes_entries")
    .select("id, first_name, last_name, email, zip, entry_date, created_at, eligible, ineligible_reason")
    .order("created_at", { ascending: true });

  type AmoeRow = {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    zip: string;
    entry_date: string;
    created_at: string;
    eligible: boolean | null;
    ineligible_reason: string | null;
  };
  const amoe = (amoeRows ?? []) as unknown as AmoeRow[];

  // Total active listings platform-wide — the number on the public scoreboard
  // and the Rules §3(a) trigger. Deliberately NOT the same as listing entries:
  // listings posted before the Promotion began count toward the 500 but earn
  // no entry. Worth seeing both side by side.
  const { count: activeTotal } = await admin
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  // Raw vs eligible. The raw figure is what the pool LOOKS like; the eligible
  // figure is the only one a drawing may use (§7), and it is also the honest
  // measure of whether the giveaway is acquiring anyone — our own entries were
  // masking it entirely.
  const eligibleListingEntries = listings.filter(
    (l) => l.seller?.sweepstakes_eligible !== false,
  ).length;
  const eligibleAmoe = amoe.filter((e) => e.eligible !== false).length;
  const totalEntries = listings.length + amoe.length;
  const totalEligible = eligibleListingEntries + eligibleAmoe;

  const stat = (label: string, value: string | number, note?: string) => (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-heading text-2xl font-bold text-navy">{value}</p>
      {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
    </div>
  );

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Link
          href="/admin"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Admin
        </Link>

        <div className="mb-6 flex items-start gap-3">
          <Ticket className="mt-1 h-6 w-6 text-orange" />
          <div>
            <h1 className="font-heading text-2xl font-bold text-navy">
              $500 Bat Giveaway — drawing audit
            </h1>
            <p className="text-sm text-muted-foreground">
              {PROMOTION_START_LABEL} &rarr; {PROMOTION_END_LABEL}, or{" "}
              {GIVEAWAY_GOAL} active listings, whichever comes first.
            </p>
          </div>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stat(
            "ELIGIBLE entries",
            totalEligible,
            `of ${totalEntries} total — §2 excludes Sponsor personnel`,
          )}
          {stat(
            "Listing entries",
            `${eligibleListingEntries} / ${listings.length}`,
            `eligible / raw · ${users.length} entrants`,
          )}
          {stat(
            "Free entries",
            `${eligibleAmoe} / ${amoe.length}`,
            "eligible / raw (AMOE)",
          )}
          {stat(
            "Active listings",
            `${activeTotal ?? 0} / ${GIVEAWAY_GOAL}`,
            "platform-wide — the public counter",
          )}
        </div>

        {(listingErr || amoeErr) && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {listingErr && <p>Listings query failed: {listingErr.message}</p>}
            {amoeErr && <p>Entries query failed: {amoeErr.message}</p>}
          </div>
        )}

        {/* ---- Listing entries per user ---- */}
        <section className="mb-8 rounded-2xl border bg-white p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-lg font-bold text-navy">
                Listing entries by user
              </h2>
              <p className="text-sm text-muted-foreground">
                Qualifying Listings posted during the period that are still
                active. Removing a listing voids its entry (Rules §5).
              </p>
            </div>
            <GiveawayExport
              label="Export listing entries"
              filename="giveaway-listing-entries.csv"
              headers={["listing_id", "title", "created_at", "seller_name", "seller_email"]}
              rows={listings.map((l) => [
                l.id,
                l.title ?? "",
                l.created_at,
                l.seller?.full_name ?? "",
                l.seller?.email ?? "",
              ])}
            />
          </div>

          {users.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No qualifying listings in the promotion period yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-4">Entrant</th>
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4 text-right">Entries</th>
                    <th className="py-2">Items</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(([id, u]) => (
                    <tr key={id} className="border-b last:border-0 align-top">
                      <td className="py-2 pr-4 font-medium text-navy">
                        {u.name}
                        {!u.eligible && (
                          <span
                            className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-700"
                            title="Official Rules §2 — not drawn from"
                          >
                            §2 excluded
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">{u.email}</td>
                      <td className="py-2 pr-4 text-right font-heading font-bold text-navy">
                        {u.count}
                      </td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {u.titles.slice(0, 3).join(", ")}
                        {u.titles.length > 3 && ` +${u.titles.length - 3} more`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ---- AMOE entries ---- */}
        <section className="rounded-2xl border bg-white p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-lg font-bold text-navy">
                Free entries (AMOE)
              </h2>
              <p className="text-sm text-muted-foreground">
                One per email per Central-time day, enforced by a unique index.
                Same odds as a listing entry (Rules §4.2).
              </p>
            </div>
            <GiveawayExport
              label="Export free entries"
              filename="giveaway-free-entries.csv"
              headers={["entry_id", "first_name", "last_name", "email", "zip", "entry_date", "created_at"]}
              rows={amoe.map((e) => [
                e.id,
                e.first_name,
                e.last_name,
                e.email,
                e.zip,
                e.entry_date,
                e.created_at,
              ])}
            />
          </div>

          {amoe.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No free entries yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">ZIP</th>
                    <th className="py-2">Entry date (CT)</th>
                  </tr>
                </thead>
                <tbody>
                  {amoe.map((e) => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium text-navy">
                        {e.first_name} {e.last_name}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">{e.email}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{e.zip}</td>
                      <td className="py-2 text-muted-foreground">{e.entry_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="mt-6 text-xs text-muted-foreground">
          Export both files and keep them with your records before drawing. The
          drawing must be reproducible from this pool if anyone asks.
        </p>
      </div>
    </main>
  );
}
