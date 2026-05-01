"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Navbar } from "@/components/navbar";
import { BottomNav } from "@/components/bottom-nav";
import { AuthGate } from "@/components/auth-gate";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  Loader2,
  MapPin,
  MessageCircle,
} from "lucide-react";

// Show any meetup that's still "live" — not just the four post-accept
// statuses from the original spec. Sellers often have unread messages
// from a `requested` meetup (buyer asking a question before they accept)
// and need to see those threads here. Terminal states (completed,
// cancelled_*, no_show_*, disputed, item_dispute) are excluded so the
// list doesn't grow forever.
const ACTIVE_STATUSES = [
  "requested",
  "countered",
  "scheduled",
  "deposit_pending",
  "buyer_confirmed",
  "seller_confirmed",
  "payment_processing",
] as const;

interface MeetupRow {
  id: string;
  status: string;
  buyer_id: string;
  seller_id: string;
  listing_id: string;
  meetup_window_start: string | null;
  meetup_location: string | null;
  created_at: string;
  buyer: { id: string; full_name: string | null } | null;
  seller: { id: string; full_name: string | null } | null;
  listing: { id: string; title: string; photo_urls: string[] } | null;
}

interface LastMessage {
  body: string;
  created_at: string;
  sender_id: string;
}

interface Conversation {
  meetup: MeetupRow;
  lastMessage: LastMessage | null;
  unread: number;
  activityIso: string;
}

function parseLocationName(raw: string | null): string {
  if (!raw) return "TBD";
  try {
    const p = JSON.parse(raw) as { type?: string; name?: string };
    if (p.type === "home_seller") return "Seller's home";
    if (p.type === "home_buyer") return "Buyer's home";
    return p.name ?? "Meetup spot";
  } catch {
    return "TBD";
  }
}

function formatActivity(iso: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatMeetupShort(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function MessagesInner() {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (alive) setLoading(false);
        return;
      }
      if (!alive) return;
      setUserId(user.id);

      const { data: meetups } = await supabase
        .from("meetups")
        .select(
          `id, status, buyer_id, seller_id, listing_id,
           meetup_window_start, meetup_location, created_at,
           buyer:users!buyer_id(id, full_name),
           seller:users!seller_id(id, full_name),
           listing:listings!listing_id(id, title, photo_urls)`,
        )
        .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
        .in("status", ACTIVE_STATUSES as unknown as string[]);

      const rows = (meetups as unknown as MeetupRow[]) ?? [];

      const enriched = await Promise.all(
        rows.map(async (m): Promise<Conversation> => {
          // Last message — prefer meetup_id, fall back to legacy listing+pair
          // for messages inserted before migration 009.
          const [{ data: lastByMeetup }, { data: lastLegacy }] =
            await Promise.all([
              supabase
                .from("messages")
                .select("body, created_at, sender_id")
                .eq("meetup_id", m.id)
                .order("created_at", { ascending: false })
                .limit(1),
              supabase
                .from("messages")
                .select("body, created_at, sender_id")
                .eq("listing_id", m.listing_id)
                .or(
                  `and(sender_id.eq.${m.buyer_id},receiver_id.eq.${m.seller_id}),and(sender_id.eq.${m.seller_id},receiver_id.eq.${m.buyer_id})`,
                )
                .order("created_at", { ascending: false })
                .limit(1),
            ]);

          const candidates = [
            ...((lastByMeetup as LastMessage[]) ?? []),
            ...((lastLegacy as LastMessage[]) ?? []),
          ].sort((a, b) => b.created_at.localeCompare(a.created_at));
          const lastMessage = candidates[0] ?? null;

          // Unread count: messages tagged with meetup_id (new) plus legacy
          // messages on the same listing+pair that pre-date migration 009.
          const [{ count: countByMeetup }, { count: countLegacy }] =
            await Promise.all([
              supabase
                .from("messages")
                .select("id", { count: "exact", head: true })
                .eq("meetup_id", m.id)
                .eq("receiver_id", user.id)
                .eq("read", false),
              supabase
                .from("messages")
                .select("id", { count: "exact", head: true })
                .is("meetup_id", null)
                .eq("listing_id", m.listing_id)
                .eq("receiver_id", user.id)
                .eq("read", false),
            ]);

          return {
            meetup: m,
            lastMessage,
            unread: (countByMeetup ?? 0) + (countLegacy ?? 0),
            activityIso:
              lastMessage?.created_at ||
              m.meetup_window_start ||
              m.created_at,
          };
        }),
      );

      enriched.sort((a, b) => b.activityIso.localeCompare(a.activityIso));

      if (!alive) return;
      setConversations(enriched);
      setLoading(false);
    };
    load();
    return () => {
      alive = false;
    };
  }, [supabase]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Navbar />
        <main className="page-with-nav flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-orange" />
        </main>
        <BottomNav />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Navbar />
        <main className="page-with-nav flex-1 flex items-center justify-center px-4">
          <div className="text-center max-w-sm">
            <MessageCircle className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <h1 className="font-heading text-xl font-bold text-navy mb-1">
              No active conversations
            </h1>
            <p className="text-sm text-muted-foreground mb-4">
              When you schedule a meetup you can message the other party
              here.
            </p>
            <Link href="/browse">
              <Button className="bg-orange hover:bg-orange-light text-white min-h-[44px]">
                Browse Gear
              </Button>
            </Link>
          </div>
        </main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="page-with-nav flex-1">
        <div className="max-w-2xl mx-auto w-full px-4 py-4">
          <h1 className="font-heading text-2xl font-bold text-navy mb-4">
            Messages
          </h1>
          <ul className="space-y-2">
            {conversations.map((c) => {
              const m = c.meetup;
              const isBuyer = m.buyer_id === userId;
              const other = isBuyer ? m.seller : m.buyer;
              const otherName = other?.full_name || "Other party";
              const initial = otherName.charAt(0).toUpperCase();
              const locName = parseLocationName(m.meetup_location);
              const meetupDate = formatMeetupShort(m.meetup_window_start);
              const preview = c.lastMessage?.body
                ? c.lastMessage.sender_id === userId
                  ? `You: ${c.lastMessage.body}`
                  : c.lastMessage.body
                : "Tap to start the conversation";

              return (
                <li key={m.id}>
                  <Link
                    href={`/meetups/${m.id}/messages`}
                    className="block bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow p-3 flex gap-3"
                  >
                    <div className="w-12 h-12 rounded-full bg-orange flex items-center justify-center text-white font-bold flex-shrink-0">
                      {initial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <p
                          className={`text-sm truncate ${
                            c.unread > 0
                              ? "font-bold text-navy"
                              : "font-semibold text-navy"
                          }`}
                        >
                          {otherName}
                        </p>
                        <span className="text-[11px] text-muted-foreground flex-shrink-0">
                          {formatActivity(c.activityIso)}
                        </span>
                      </div>
                      <p className="text-xs text-orange truncate font-semibold">
                        {m.listing?.title || "Meetup"}
                      </p>
                      <p
                        className={`text-sm mt-1 truncate ${
                          c.unread > 0
                            ? "font-semibold text-navy"
                            : "text-muted-foreground"
                        }`}
                      >
                        {preview}
                      </p>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                        {meetupDate && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {meetupDate}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{locName}</span>
                        </span>
                      </div>
                    </div>
                    {c.unread > 0 && (
                      <div className="flex flex-col items-center justify-center flex-shrink-0">
                        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-orange text-white text-[11px] font-bold flex items-center justify-center">
                          {c.unread > 99 ? "99+" : c.unread}
                        </span>
                      </div>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}

export default function MessagesPage() {
  return (
    <AuthGate reason="Sign in to see your meetup conversations.">
      <MessagesInner />
    </AuthGate>
  );
}
