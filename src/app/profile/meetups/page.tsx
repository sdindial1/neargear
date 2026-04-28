"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { Navbar } from "@/components/navbar";
import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  Check,
  Clock,
  ImageIcon,
  Loader2,
  MapPin,
  Star,
  X,
  Handshake,
} from "lucide-react";

type TabKey = "incoming" | "sent" | "scheduled" | "past";

interface MeetupRow {
  id: string;
  status: string;
  offered_price: number;
  meetup_window_start: string;
  meetup_window_end: string;
  meetup_location: string | null;
  created_at: string;
  buyer_id: string;
  seller_id: string;
  listing?: {
    id: string;
    title: string;
    photo_urls: string[];
    price: number;
  };
  buyer?: {
    id: string;
    full_name: string | null;
    avg_rating: number | null;
    city: string | null;
  };
  seller?: {
    id: string;
    full_name: string | null;
    avg_rating: number | null;
    city: string | null;
  };
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "incoming", label: "Incoming" },
  { key: "sent", label: "Sent" },
  { key: "scheduled", label: "Scheduled" },
  { key: "past", label: "Past" },
];

const STATUS_BADGE_CLASS: Record<string, string> = {
  requested: "bg-amber-100 text-amber-800",
  countered: "bg-blue-100 text-blue-800",
  scheduled: "bg-green-100 text-green-800",
  completed: "bg-gray-200 text-gray-700",
  cancelled_buyer: "bg-gray-200 text-gray-600",
  cancelled_seller: "bg-gray-200 text-gray-600",
  cancelled_auto: "bg-gray-200 text-gray-600",
  no_show_buyer: "bg-red-100 text-red-700",
  no_show_seller: "bg-red-100 text-red-700",
  disputed: "bg-red-100 text-red-800",
};

const STATUS_BADGE_LABEL: Record<string, string> = {
  requested: "Requested",
  countered: "Countered",
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled_buyer: "Cancelled by buyer",
  cancelled_seller: "Cancelled by seller",
  cancelled_auto: "Expired",
  no_show_buyer: "Buyer no-show",
  no_show_seller: "Seller no-show",
  disputed: "Disputed",
};

function countdownLabel(start: Date): string {
  const diff = start.getTime() - Date.now();
  if (diff <= 0) return "Now";
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) {
    const mins = Math.max(1, Math.floor(diff / 60000));
    return `In ${mins} min`;
  }
  if (hours < 24) return `In ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `In ${days} day${days === 1 ? "" : "s"}`;
}

function formatHour(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function ProfileMeetupsPageInner() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<MeetupRow[]>([]);
  const [tab, setTab] = useState<TabKey>("incoming");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);

      const { data } = await supabase
        .from("meetups")
        .select(
          `*,
           listing:listings!listing_id(id, title, photo_urls, price),
           buyer:users!buyer_id(id, full_name, avg_rating, city),
           seller:users!seller_id(id, full_name, avg_rating, city)`,
        )
        .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
        .order("created_at", { ascending: false });

      setRows((data as MeetupRow[]) || []);

      const hasIncoming = (data || []).some(
        (m) => m.seller_id === user.id && m.status === "requested",
      );
      setTab(hasIncoming ? "incoming" : "sent");
      setLoading(false);
    };
    load();
  }, [supabase]);

  const tabRows = useMemo(() => {
    if (!userId) {
      return { incoming: [], sent: [], scheduled: [], past: [] } as Record<
        TabKey,
        MeetupRow[]
      >;
    }
    return {
      incoming: rows.filter(
        (m) =>
          m.seller_id === userId &&
          (m.status === "requested" || m.status === "countered"),
      ),
      sent: rows.filter(
        (m) =>
          m.buyer_id === userId &&
          (m.status === "requested" || m.status === "countered"),
      ),
      scheduled: rows.filter((m) => m.status === "scheduled"),
      past: rows.filter((m) =>
        [
          "completed",
          "cancelled_buyer",
          "cancelled_seller",
          "cancelled_auto",
          "no_show_buyer",
          "no_show_seller",
          "disputed",
        ].includes(m.status),
      ),
    } as Record<TabKey, MeetupRow[]>;
  }, [rows, userId]);

  const filtered = tabRows[tab];

  const handleAccept = async (m: MeetupRow) => {
    setBusyId(m.id);
    const { error } = await supabase
      .from("meetups")
      .update({ status: "scheduled" })
      .eq("id", m.id);
    setBusyId(null);
    if (error) return;
    setRows((prev) =>
      prev.map((r) => (r.id === m.id ? { ...r, status: "scheduled" } : r)),
    );
    router.push(`/meetups/${m.id}`);
  };

  const handleDecline = async (m: MeetupRow) => {
    setBusyId(m.id);
    await supabase
      .from("meetups")
      .update({ status: "cancelled_seller" })
      .eq("id", m.id);
    if (m.listing?.id) {
      await supabase
        .from("listings")
        .update({ status: "active" })
        .eq("id", m.listing.id);
    }
    setBusyId(null);
    setRows((prev) =>
      prev.map((r) =>
        r.id === m.id ? { ...r, status: "cancelled_seller" } : r,
      ),
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-orange" />
        </main>
        <BottomNav />
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <p className="font-heading text-lg font-bold text-navy mb-2">
            Sign in to see your meetups
          </p>
          <Link href="/auth/login">
            <Button className="btn-large btn-primary max-w-xs mt-3">
              Sign in
            </Button>
          </Link>
        </main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-5 page-with-nav">
        <h1 className="font-heading text-2xl font-bold text-navy mb-4">
          My Meetups
        </h1>

        <div className="flex gap-1 bg-white rounded-xl p-1 border mb-4 overflow-x-auto no-scrollbar">
          {TABS.map((t) => {
            const count = tabRows[t.key].length;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex-shrink-0 px-3 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                  tab === t.key
                    ? "bg-orange text-white"
                    : "text-muted-foreground hover:bg-gray-50"
                }`}
              >
                {t.label}
                {count > 0 && (
                  <span
                    className={`text-[10px] font-bold rounded-full px-1.5 min-w-[18px] text-center ${
                      tab === t.key
                        ? "bg-white/20 text-white"
                        : "bg-orange/10 text-orange"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl shadow-sm">
            <Handshake className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-navy font-semibold">
              {tab === "incoming"
                ? "No buyer requests yet"
                : tab === "sent"
                  ? "You haven't sent any requests"
                  : tab === "scheduled"
                    ? "No meetups scheduled"
                    : "No past meetups"}
            </p>
            <p className="text-sm text-muted-foreground mt-1 mb-4 px-6">
              {tab === "incoming"
                ? "When buyers send you offers, they'll show up here."
                : tab === "sent"
                  ? "Find a piece of gear and tap Request to Buy."
                  : tab === "scheduled"
                    ? "Confirm a request to schedule a meetup."
                    : "Completed and cancelled meetups land here."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((m) => (
              <MeetupCard
                key={m.id}
                meetup={m}
                viewerId={userId}
                showActions={tab === "incoming"}
                busy={busyId === m.id}
                onAccept={() => handleAccept(m)}
                onDecline={() => handleDecline(m)}
              />
            ))}
          </div>
        )}

        <div className="mt-10 text-center">
          <button
            type="button"
            onClick={async () => {
              const res = await fetch("/api/cron/expire-requests", {
                method: "POST",
              });
              const json = await res.json();
              toast.success(
                `Expiry run: ${json.expired ?? 0} cancelled, ${json.notified ?? 0} would-notify`,
              );
              location.reload();
            }}
            className="text-xs text-muted-foreground underline underline-offset-2"
          >
            Run expiry check (dev)
          </button>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}

function MeetupCard({
  meetup,
  viewerId,
  showActions,
  busy,
  onAccept,
  onDecline,
}: {
  meetup: MeetupRow;
  viewerId: string;
  showActions: boolean;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const isSeller = viewerId === meetup.seller_id;
  const other = isSeller ? meetup.buyer : meetup.seller;
  const listingPrice = meetup.listing ? meetup.listing.price / 100 : 0;
  const offeredPrice = meetup.offered_price / 100;
  const offerBelow = offeredPrice < listingPrice;
  const start = new Date(meetup.meetup_window_start);
  const end = new Date(meetup.meetup_window_end);
  let location: { name?: string } | null = null;
  try {
    if (meetup.meetup_location) location = JSON.parse(meetup.meetup_location);
  } catch {}

  return (
    <div className="bg-white rounded-2xl border p-4">
      <Link
        href={`/meetups/${meetup.id}`}
        className="flex gap-3 hover:opacity-90"
      >
        <div className="w-16 h-16 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
          {meetup.listing?.photo_urls?.[0] ? (
            <img
              src={meetup.listing.photo_urls[0]}
              alt={meetup.listing.title}
              className="w-full h-full object-contain bg-white"
            />
          ) : (
            <ImageIcon className="w-6 h-6 text-gray-200" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-navy line-clamp-1">
            {meetup.listing?.title || "Listing"}
          </p>
          {other && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <span>{other.full_name || "Anonymous"}</span>
              {other.avg_rating != null && other.avg_rating > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  <Star className="w-3 h-3 fill-orange text-orange" />
                  {other.avg_rating.toFixed(1)}
                </span>
              )}
              <span>· {formatRelative(meetup.created_at)}</span>
            </div>
          )}
          <div className="mt-1">
            {offerBelow ? (
              <p className="text-sm">
                <span className="line-through text-muted-foreground tabular-nums">
                  ${listingPrice.toFixed(0)}
                </span>{" "}
                <span className="font-bold text-orange tabular-nums">
                  ${offeredPrice.toFixed(0)}
                </span>
              </p>
            ) : (
              <p className="text-sm font-bold text-orange tabular-nums">
                ${offeredPrice.toFixed(0)}
              </p>
            )}
          </div>
        </div>
      </Link>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          {start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatHour(start)}–{formatHour(end)}
        </span>
        {location?.name && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {location.name}
          </span>
        )}
      </div>

      {showActions && (
        <div className="flex gap-2 mt-3">
          <Button
            onClick={onAccept}
            disabled={busy}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white h-11"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Accept
          </Button>
          <Button
            onClick={onDecline}
            disabled={busy}
            variant="outline"
            className="flex-1 h-11 border-red-200 text-red-600"
          >
            <X className="w-4 h-4" /> Decline
          </Button>
        </div>
      )}

      {!showActions && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Badge className={`text-[11px] font-semibold ${STATUS_BADGE_CLASS[meetup.status] || "bg-navy/5 text-navy"}`}>
            {STATUS_BADGE_LABEL[meetup.status] || meetup.status}
          </Badge>
          {meetup.status === "scheduled" && (
            <span className="text-[11px] font-semibold text-orange">
              {countdownLabel(start)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

import { AuthGate } from "@/components/auth-gate";

export default function ProfileMeetupsPage() {
  return (
    <AuthGate reason="Sign in to see your meetups and respond to requests.">
      <ProfileMeetupsPageInner />
    </AuthGate>
  );
}
