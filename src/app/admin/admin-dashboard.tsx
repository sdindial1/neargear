"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ImageIcon,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";

interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  city: string | null;
  zipcode: string | null;
  account_status: string | null;
  created_at: string;
}

interface AdminListing {
  id: string;
  title: string;
  sport: string;
  condition: string;
  status: string;
  price: number;
  photo_urls: string[];
  created_at: string;
  seller_id: string;
  seller?: { full_name: string | null; email: string } | null;
}

interface AdminMeetup {
  id: string;
  status: string;
  offered_price: number | null;
  meetup_window_start: string | null;
  meetup_window_end: string | null;
  meetup_location: string | null;
  created_at: string;
  buyer_id: string;
  seller_id: string;
  listing?: { title: string } | null;
  buyer?: { full_name: string | null } | null;
  seller?: { full_name: string | null } | null;
}

interface AdminTransaction {
  id: string;
  gross_amount: number;
  platform_fee: number;
  net_amount: number;
  auto_completed: boolean;
  created_at: string;
  buyer_id: string;
  seller_id: string;
  listing?: { title: string } | null;
  buyer?: { full_name: string | null } | null;
  seller?: { full_name: string | null } | null;
}

interface AdminReport {
  id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  reporter_id: string;
  reported_listing_id: string | null;
  reported_user_id: string | null;
  reporter?: { full_name: string | null; email: string } | null;
  reported_listing?: { title: string } | null;
  reported_user?: { full_name: string | null; email: string } | null;
}

export interface AdminPayload {
  fetchedAt: string;
  users: AdminUser[];
  listings: AdminListing[];
  meetups: AdminMeetup[];
  transactions: AdminTransaction[];
  reports: AdminReport[];
}

function fmtMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  pending: "bg-amber-100 text-amber-800",
  sold: "bg-gray-200 text-gray-700",
  removed: "bg-red-100 text-red-800",
  requested: "bg-amber-100 text-amber-800",
  scheduled: "bg-green-100 text-green-800",
  countered: "bg-blue-100 text-blue-800",
  completed: "bg-gray-200 text-gray-700",
  cancelled_buyer: "bg-gray-200 text-gray-600",
  cancelled_seller: "bg-gray-200 text-gray-600",
  cancelled_auto: "bg-gray-200 text-gray-600",
  no_show_buyer: "bg-red-100 text-red-700",
  no_show_seller: "bg-red-100 text-red-700",
  disputed: "bg-red-100 text-red-800",
  flagged: "bg-amber-100 text-amber-800",
  banned: "bg-red-100 text-red-800",
};

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="bg-white/10 border border-white/10 rounded-xl p-4">
      <p className="text-[11px] uppercase tracking-wide text-white/50 font-semibold">
        {label}
      </p>
      <p className="font-heading text-2xl md:text-3xl font-bold text-white mt-1 tabular-nums">
        {value}
      </p>
      {hint && (
        <p className="text-[11px] text-white/40 mt-0.5">{hint}</p>
      )}
    </div>
  );
}

export function AdminDashboard({ payload }: { payload: AdminPayload }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();

  const usersById = useMemo(() => {
    const m = new Map<string, AdminUser>();
    for (const u of payload.users) m.set(u.id, u);
    return m;
  }, [payload.users]);

  const listingsBySeller = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of payload.listings) {
      m.set(l.seller_id, (m.get(l.seller_id) ?? 0) + 1);
    }
    return m;
  }, [payload.listings]);

  const txnsByUser = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of payload.transactions) {
      if (t.buyer_id) m.set(t.buyer_id, (m.get(t.buyer_id) ?? 0) + 1);
      if (t.seller_id) m.set(t.seller_id, (m.get(t.seller_id) ?? 0) + 1);
    }
    return m;
  }, [payload.transactions]);

  const totals = useMemo(() => {
    const gmv = payload.transactions.reduce(
      (s, t) => s + (t.gross_amount ?? 0),
      0,
    );
    const fees = payload.transactions.reduce(
      (s, t) => s + (t.platform_fee ?? 0),
      0,
    );
    const netSeller = payload.transactions.reduce(
      (s, t) => s + (t.net_amount ?? 0),
      0,
    );
    return {
      gmv,
      fees,
      netSeller,
      activeListings: payload.listings.filter((l) => l.status === "active").length,
      scheduledMeetups: payload.meetups.filter((m) => m.status === "scheduled").length,
      pendingMeetups: payload.meetups.filter((m) => m.status === "requested").length,
    };
  }, [payload]);

  // ----- Users table -----
  const [userSearch, setUserSearch] = useState("");
  const [userSort, setUserSort] = useState<
    "newest" | "most_listings" | "most_transactions"
  >("newest");

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    let list = q
      ? payload.users.filter(
          (u) =>
            u.email.toLowerCase().includes(q) ||
            (u.full_name ?? "").toLowerCase().includes(q),
        )
      : [...payload.users];
    if (userSort === "newest") {
      list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    } else if (userSort === "most_listings") {
      list.sort(
        (a, b) =>
          (listingsBySeller.get(b.id) ?? 0) - (listingsBySeller.get(a.id) ?? 0),
      );
    } else {
      list.sort(
        (a, b) =>
          (txnsByUser.get(b.id) ?? 0) - (txnsByUser.get(a.id) ?? 0),
      );
    }
    return list;
  }, [payload.users, userSearch, userSort, listingsBySeller, txnsByUser]);

  // ----- Listings table -----
  const [listingSearch, setListingSearch] = useState("");
  const [listingStatus, setListingStatus] = useState<string>("all");
  const [listingSport, setListingSport] = useState<string>("all");
  const [removingId, setRemovingId] = useState<string | null>(null);

  const sportOptions = useMemo(() => {
    const s = new Set<string>();
    for (const l of payload.listings) s.add(l.sport);
    return Array.from(s).sort();
  }, [payload.listings]);

  const filteredListings = useMemo(() => {
    const q = listingSearch.trim().toLowerCase();
    return payload.listings.filter((l) => {
      if (listingStatus !== "all" && l.status !== listingStatus) return false;
      if (listingSport !== "all" && l.sport !== listingSport) return false;
      if (q) {
        const sellerName = l.seller?.full_name?.toLowerCase() ?? "";
        if (
          !l.title.toLowerCase().includes(q) &&
          !sellerName.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [payload.listings, listingSearch, listingStatus, listingSport]);

  const handleRemoveListing = async (id: string, title: string) => {
    if (!confirm(`Remove "${title}"? Listing will be hidden from browse.`)) return;
    setRemovingId(id);
    const res = await fetch(`/api/admin/listings/${id}/remove`, {
      method: "POST",
    });
    setRemovingId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(`Failed: ${body.error ?? res.status}`);
      return;
    }
    toast.success("Listing removed");
    router.refresh();
  };

  // ----- Transactions table -----
  const [txnSort, setTxnSort] = useState<"newest" | "largest">("newest");
  const sortedTransactions = useMemo(() => {
    const list = [...payload.transactions];
    if (txnSort === "newest") {
      list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    } else {
      list.sort((a, b) => b.gross_amount - a.gross_amount);
    }
    return list;
  }, [payload.transactions, txnSort]);

  // ----- Meetups table -----
  const [meetupStatus, setMeetupStatus] = useState<string>("all");
  const [meetupSearch, setMeetupSearch] = useState("");

  const filteredMeetups = useMemo(() => {
    const q = meetupSearch.trim().toLowerCase();
    return payload.meetups.filter((m) => {
      if (meetupStatus !== "all" && m.status !== meetupStatus) return false;
      if (q) {
        const title = m.listing?.title?.toLowerCase() ?? "";
        const buyer = m.buyer?.full_name?.toLowerCase() ?? "";
        const seller = m.seller?.full_name?.toLowerCase() ?? "";
        if (
          !title.includes(q) &&
          !buyer.includes(q) &&
          !seller.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [payload.meetups, meetupStatus, meetupSearch]);

  const meetupStatuses = useMemo(() => {
    const s = new Set<string>();
    for (const m of payload.meetups) s.add(m.status);
    return Array.from(s).sort();
  }, [payload.meetups]);

  const handleRefresh = () => {
    startRefresh(() => router.refresh());
  };

  return (
    <main className="min-h-screen bg-navy text-white">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-8">
        <header className="flex items-end justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-orange font-semibold flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Admin
            </p>
            <h1 className="font-heading text-2xl md:text-3xl font-bold text-white">
              NearGear Admin
            </h1>
            <p className="text-xs text-white/50 mt-0.5">
              Last updated {new Date(payload.fetchedAt).toLocaleTimeString()}
            </p>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            variant="outline"
            className="border-white/20 text-white hover:bg-white/10 h-10"
          >
            {refreshing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Refresh
          </Button>
        </header>

        {/* Top metrics */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="Total Users"
            value={String(payload.users.length)}
          />
          <MetricCard
            label="Total Listings"
            value={String(payload.listings.length)}
          />
          <MetricCard label="Total GMV" value={fmtMoney(totals.gmv)} />
          <MetricCard
            label="Platform Revenue"
            value={fmtMoney(totals.fees)}
            hint="sum of platform fees"
          />
        </section>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="Active Listings"
            value={String(totals.activeListings)}
          />
          <MetricCard
            label="Completed Transactions"
            value={String(payload.transactions.length)}
          />
          <MetricCard
            label="Scheduled Meetups"
            value={String(totals.scheduledMeetups)}
          />
          <MetricCard
            label="Pending Meetups"
            value={String(totals.pendingMeetups)}
          />
        </section>

        {/* Users */}
        <section className="bg-white text-navy rounded-2xl p-4 md:p-6">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-4">
            <h2 className="font-heading text-xl font-bold">Users</h2>
            <div className="flex gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search name or email"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Select
                value={userSort}
                onValueChange={(v) =>
                  setUserSort((v as typeof userSort) ?? "newest")
                }
              >
                <SelectTrigger className="h-9 w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="most_listings">Most listings</SelectItem>
                  <SelectItem value="most_transactions">
                    Most transactions
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="overflow-x-auto -mx-4 md:mx-0">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
                  <th className="py-2 px-3">Name</th>
                  <th className="py-2 px-3">Email</th>
                  <th className="py-2 px-3">Location</th>
                  <th className="py-2 px-3">Joined</th>
                  <th className="py-2 px-3 text-right">Listings</th>
                  <th className="py-2 px-3 text-right">Txns</th>
                  <th className="py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-6 text-center text-muted-foreground"
                    >
                      No users match.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const status = u.account_status ?? "active";
                    return (
                      <tr key={u.id} className="border-b last:border-0">
                        <td className="py-2 px-3 font-medium">
                          {u.full_name || "—"}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">
                          {u.email}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">
                          {u.city ?? "—"}
                          {u.zipcode ? ` ${u.zipcode}` : ""}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">
                          {fmtDate(u.created_at)}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">
                          {listingsBySeller.get(u.id) ?? 0}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">
                          {txnsByUser.get(u.id) ?? 0}
                        </td>
                        <td className="py-2 px-3">
                          <Badge
                            className={`${STATUS_BADGE[status] ?? "bg-gray-200 text-gray-700"} text-[11px]`}
                          >
                            {status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Listings */}
        <section className="bg-white text-navy rounded-2xl p-4 md:p-6">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-4">
            <h2 className="font-heading text-xl font-bold">Listings</h2>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search title or seller"
                  value={listingSearch}
                  onChange={(e) => setListingSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Select
                value={listingStatus}
                onValueChange={(v) => setListingStatus(v ?? "all")}
              >
                <SelectTrigger className="h-9 w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="sold">Sold</SelectItem>
                  <SelectItem value="removed">Removed</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={listingSport}
                onValueChange={(v) => setListingSport(v ?? "all")}
              >
                <SelectTrigger className="h-9 w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sports</SelectItem>
                  {sportOptions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="overflow-x-auto -mx-4 md:mx-0">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
                  <th className="py-2 px-3">Item</th>
                  <th className="py-2 px-3">Seller</th>
                  <th className="py-2 px-3 text-right">Price</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Created</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {filteredListings.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-6 text-center text-muted-foreground"
                    >
                      No listings match.
                    </td>
                  </tr>
                ) : (
                  filteredListings.map((l) => (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-10 h-10 rounded-md bg-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                            {l.photo_urls?.[0] ? (
                              <img
                                src={l.photo_urls[0]}
                                alt={l.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <ImageIcon className="w-4 h-4 text-gray-300" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-navy line-clamp-1">
                              {l.title}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {l.sport} · {l.condition}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">
                        {l.seller?.full_name || l.seller?.email || "—"}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {fmtMoney(l.price)}
                      </td>
                      <td className="py-2 px-3">
                        <Badge
                          className={`${STATUS_BADGE[l.status] ?? "bg-gray-200 text-gray-700"} text-[11px]`}
                        >
                          {l.status}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">
                        {fmtDate(l.created_at)}
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        <Link
                          href={`/listings/${l.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-orange font-semibold mr-2"
                        >
                          View
                        </Link>
                        {l.status !== "removed" && l.status !== "sold" && (
                          <button
                            type="button"
                            onClick={() => handleRemoveListing(l.id, l.title)}
                            disabled={removingId === l.id}
                            className="inline-flex items-center gap-1 text-xs text-red-600 font-semibold disabled:opacity-50"
                          >
                            {removingId === l.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Trash2 className="w-3 h-3" />
                            )}
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Transactions */}
        <section className="bg-white text-navy rounded-2xl p-4 md:p-6">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-4">
            <h2 className="font-heading text-xl font-bold">Transactions</h2>
            <Select
              value={txnSort}
              onValueChange={(v) => setTxnSort((v as typeof txnSort) ?? "newest")}
            >
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="largest">Largest amount</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="overflow-x-auto -mx-4 md:mx-0">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
                  <th className="py-2 px-3">Date</th>
                  <th className="py-2 px-3">Item</th>
                  <th className="py-2 px-3">Buyer</th>
                  <th className="py-2 px-3">Seller</th>
                  <th className="py-2 px-3 text-right">Gross</th>
                  <th className="py-2 px-3 text-right">Fee</th>
                  <th className="py-2 px-3 text-right">Net</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {sortedTransactions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="py-6 text-center text-muted-foreground"
                    >
                      No transactions yet.
                    </td>
                  </tr>
                ) : (
                  sortedTransactions.map((t) => (
                    <tr key={t.id} className="border-b last:border-0">
                      <td className="py-2 px-3 text-muted-foreground">
                        {fmtDate(t.created_at)}
                      </td>
                      <td className="py-2 px-3 line-clamp-1">
                        {t.listing?.title ?? "—"}
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">
                        {t.buyer?.full_name ??
                          (t.buyer_id ? usersById.get(t.buyer_id)?.email : "—") ??
                          "—"}
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">
                        {t.seller?.full_name ??
                          (t.seller_id
                            ? usersById.get(t.seller_id)?.email
                            : "—") ??
                          "—"}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {fmtMoney(t.gross_amount)}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-orange font-semibold">
                        {fmtMoney(t.platform_fee)}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {fmtMoney(t.net_amount)}
                      </td>
                      <td className="py-2 px-3 text-[10px] text-muted-foreground">
                        {t.auto_completed ? "auto" : ""}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {sortedTransactions.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-navy/10 font-semibold">
                    <td colSpan={4} className="py-2 px-3 text-right">
                      Totals
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {fmtMoney(totals.gmv)}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-orange">
                      {fmtMoney(totals.fees)}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {fmtMoney(totals.netSeller)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>

        {/* Meetups */}
        <section className="bg-white text-navy rounded-2xl p-4 md:p-6">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-4">
            <h2 className="font-heading text-xl font-bold">Meetups</h2>
            <div className="flex gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search title or user"
                  value={meetupSearch}
                  onChange={(e) => setMeetupSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Select
                value={meetupStatus}
                onValueChange={(v) => setMeetupStatus(v ?? "all")}
              >
                <SelectTrigger className="h-9 w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  {meetupStatuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="overflow-x-auto -mx-4 md:mx-0">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
                  <th className="py-2 px-3">Created</th>
                  <th className="py-2 px-3">Item</th>
                  <th className="py-2 px-3">Buyer</th>
                  <th className="py-2 px-3">Seller</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3 text-right">Offer</th>
                  <th className="py-2 px-3">Window</th>
                  <th className="py-2 px-3">Location</th>
                </tr>
              </thead>
              <tbody>
                {filteredMeetups.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="py-6 text-center text-muted-foreground"
                    >
                      No meetups match.
                    </td>
                  </tr>
                ) : (
                  filteredMeetups.map((m) => {
                    let locName: string | null = null;
                    try {
                      if (m.meetup_location) {
                        locName = JSON.parse(m.meetup_location).name ?? null;
                      }
                    } catch {}
                    const start = m.meetup_window_start
                      ? new Date(m.meetup_window_start)
                      : null;
                    return (
                      <tr key={m.id} className="border-b last:border-0">
                        <td className="py-2 px-3 text-muted-foreground">
                          {fmtDate(m.created_at)}
                        </td>
                        <td className="py-2 px-3 line-clamp-1">
                          {m.listing?.title ?? "—"}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">
                          {m.buyer?.full_name ?? "—"}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">
                          {m.seller?.full_name ?? "—"}
                        </td>
                        <td className="py-2 px-3">
                          <Badge
                            className={`${STATUS_BADGE[m.status] ?? "bg-gray-200 text-gray-700"} text-[11px]`}
                          >
                            {m.status}
                          </Badge>
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">
                          {m.offered_price != null
                            ? fmtMoney(m.offered_price)
                            : "—"}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground text-xs">
                          {start
                            ? start.toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })
                            : "—"}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground text-xs line-clamp-1">
                          {locName ?? "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Reports */}
        <ReportsSection reports={payload.reports} />
      </div>
    </main>
  );
}

function ReportsSection({ reports }: { reports: AdminReport[] }) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return reports;
    return reports.filter((r) => r.status === statusFilter);
  }, [reports, statusFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of reports) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [reports]);

  const update = async (id: string, status: "dismissed" | "actioned") => {
    setBusyId(id);
    const res = await fetch(`/api/admin/reports/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(`Failed: ${body.error ?? res.status}`);
      return;
    }
    toast.success(status === "dismissed" ? "Report dismissed" : "Marked actioned");
    router.refresh();
  };

  return (
    <section className="bg-white text-navy rounded-2xl p-4 md:p-6">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-4">
        <h2 className="font-heading text-xl font-bold">
          Reports{" "}
          {counts.pending ? (
            <span className="ml-2 text-sm font-semibold text-red-600">
              {counts.pending} pending
            </span>
          ) : null}
        </h2>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v ?? "pending")}
        >
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="actioned">Actioned</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground text-sm">
          No reports.
        </p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((r) => {
            const targetIsListing = !!r.reported_listing_id;
            const targetLabel = targetIsListing
              ? r.reported_listing?.title || "(missing listing)"
              : r.reported_user?.full_name ||
                r.reported_user?.email ||
                "(missing user)";
            const targetHref = targetIsListing
              ? `/listings/${r.reported_listing_id}`
              : `/profile`;
            return (
              <li
                key={r.id}
                className="border rounded-xl p-3 flex flex-col sm:flex-row gap-3 sm:items-start"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <Badge
                      className={
                        r.status === "pending"
                          ? "bg-amber-100 text-amber-800"
                          : r.status === "actioned"
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-200 text-gray-700"
                      }
                    >
                      {r.status}
                    </Badge>
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {targetIsListing ? "Listing" : "User"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {fmtDate(r.created_at)}
                    </span>
                  </div>
                  <p className="font-semibold text-navy mt-1">
                    {r.reason}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Target:{" "}
                    <Link
                      href={targetHref}
                      target="_blank"
                      className="text-orange hover:underline"
                    >
                      {targetLabel}
                    </Link>
                    {" · "}
                    Reporter: {r.reporter?.full_name || r.reporter?.email || "?"}
                  </p>
                  {r.details && (
                    <p className="text-sm text-navy/90 mt-2 bg-gray-50 rounded-lg p-2">
                      {r.details}
                    </p>
                  )}
                </div>
                {r.status === "pending" && (
                  <div className="flex sm:flex-col gap-2 flex-shrink-0">
                    <Link href={targetHref} target="_blank">
                      <Button
                        variant="outline"
                        className="h-8 px-3 text-xs"
                      >
                        Take Action
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      onClick={() => update(r.id, "dismissed")}
                      disabled={busyId === r.id}
                      className="h-8 px-3 text-xs"
                    >
                      Dismiss
                    </Button>
                    <Button
                      onClick={() => update(r.id, "actioned")}
                      disabled={busyId === r.id}
                      className="h-8 px-3 text-xs bg-orange hover:bg-orange-light text-white"
                    >
                      Mark Done
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
