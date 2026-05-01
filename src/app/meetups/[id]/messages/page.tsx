"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDirectionsUrl } from "@/lib/safezones";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  ImageIcon,
  Loader2,
  MapPin,
  Navigation,
  Send,
  User as UserIcon,
} from "lucide-react";

interface Msg {
  id: string;
  listing_id: string;
  sender_id: string;
  receiver_id: string;
  body: string;
  read: boolean;
  created_at: string;
}

interface MeetupCtx {
  id: string;
  buyer_id: string;
  seller_id: string;
  listing_id: string;
  offered_price: number | null;
  meetup_window_start: string | null;
  meetup_window_end: string | null;
  meetup_location: string | null;
  buyer?: { id: string; full_name: string | null };
  seller?: { id: string; full_name: string | null };
  listing?: { id: string; title: string; photo_urls: string[] };
}

interface ParsedLocation {
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

function parseLocation(raw: string | null): ParsedLocation | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as {
      type?: string;
      name?: string;
      address?: string;
      lat?: number;
      lng?: number;
    };
    if (p.type === "home_seller") {
      return {
        name: "Seller's home",
        address: p.address ?? null,
        lat: null,
        lng: null,
      };
    }
    if (p.type === "home_buyer") {
      return {
        name: "Buyer's home",
        address: p.address ?? null,
        lat: null,
        lng: null,
      };
    }
    return {
      name: p.name ?? "Meetup spot",
      address: p.address ?? null,
      lat: p.lat ?? null,
      lng: p.lng ?? null,
    };
  } catch {
    return null;
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDayHeader(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayOf = new Date(d);
  dayOf.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today.getTime() - dayOf.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function formatMeetupDate(start: string | null, end: string | null): string {
  if (!start) return "TBD";
  const s = new Date(start);
  const day = s.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  if (!end) {
    return `${day} · ${formatTime(start)}`;
  }
  return `${day} · ${formatTime(start)} – ${formatTime(end)}`;
}

function AceAvatar({ size = 32 }: { size?: number }) {
  return (
    <div
      className="rounded-full bg-orange flex items-center justify-center flex-shrink-0"
      style={{
        width: size,
        height: size,
        boxShadow: "0 2px 6px rgba(255, 107, 53, 0.4)",
      }}
    >
      <svg width={size} height={size} viewBox="0 0 56 56">
        <circle cx="22" cy="24" r="2.5" fill="#0d2438" />
        <circle cx="34" cy="24" r="2.5" fill="#0d2438" />
        <path
          d="M 22 34 Q 28 39 34 34"
          stroke="#0d2438"
          strokeWidth={2.2}
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  );
}

function MeetupMessagesPageInner() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const supabase = useMemo(() => createClient(), []);

  const [ctx, setCtx] = useState<MeetupCtx | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoadError("You need to sign in to message.");
        setLoading(false);
        return;
      }
      setUserId(user.id);

      const { data: m, error: mErr } = await supabase
        .from("meetups")
        .select(
          `id, buyer_id, seller_id, listing_id, offered_price,
           meetup_window_start, meetup_window_end, meetup_location,
           listing:listings!listing_id(id, title, photo_urls),
           buyer:users!buyer_id(id, full_name),
           seller:users!seller_id(id, full_name)`,
        )
        .eq("id", params.id)
        .single();

      if (mErr || !m) {
        setLoadError("Meetup not found.");
        setLoading(false);
        return;
      }
      const meetupCtx = m as unknown as MeetupCtx;
      if (user.id !== meetupCtx.buyer_id && user.id !== meetupCtx.seller_id) {
        setLoadError("You're not part of this meetup.");
        setLoading(false);
        return;
      }
      setCtx(meetupCtx);

      // Prefer fetching by meetup_id (broadened RLS in migration 009);
      // fall back to the legacy sender/receiver pair filter for messages
      // inserted before the column was added.
      const { data: byMeetup } = await supabase
        .from("messages")
        .select("*")
        .eq("meetup_id", meetupCtx.id)
        .order("created_at", { ascending: true });
      let msgs = (byMeetup as Msg[]) || [];
      if (msgs.length === 0) {
        const orFilter = `and(sender_id.eq.${meetupCtx.buyer_id},receiver_id.eq.${meetupCtx.seller_id}),and(sender_id.eq.${meetupCtx.seller_id},receiver_id.eq.${meetupCtx.buyer_id})`;
        const { data: legacy } = await supabase
          .from("messages")
          .select("*")
          .eq("listing_id", meetupCtx.listing_id)
          .or(orFilter)
          .order("created_at", { ascending: true });
        msgs = (legacy as Msg[]) || [];
      }
      setMessages(msgs);

      await supabase
        .from("messages")
        .update({ read: true })
        .eq("listing_id", meetupCtx.listing_id)
        .eq("receiver_id", user.id)
        .eq("read", false);

      setLoading(false);
    };
    load();
  }, [params.id, supabase]);

  useEffect(() => {
    if (!ctx || !userId) return;
    const channel = supabase
      .channel(`meetup-messages-${ctx.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `listing_id=eq.${ctx.listing_id}`,
        },
        (payload) => {
          const m = payload.new as Msg & { meetup_id?: string | null };
          const matchesMeetupId = m.meetup_id === ctx.id;
          const matchesPair =
            (m.sender_id === ctx.buyer_id && m.receiver_id === ctx.seller_id) ||
            (m.sender_id === ctx.seller_id && m.receiver_id === ctx.buyer_id);
          if (!matchesMeetupId && !matchesPair) return;
          setMessages((prev) =>
            prev.find((x) => x.id === m.id) ? prev : [...prev, m],
          );
          if (m.receiver_id === userId && !m.read) {
            supabase
              .from("messages")
              .update({ read: true })
              .eq("id", m.id)
              .then(() => undefined);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [ctx, userId, supabase]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const sendBody = async (body: string) => {
    if (!ctx || !userId || !body.trim() || sending) return;
    setSending(true);
    setSendError("");
    const otherId = userId === ctx.buyer_id ? ctx.seller_id : ctx.buyer_id;
    const { error: sendErr } = await supabase.from("messages").insert({
      listing_id: ctx.listing_id,
      meetup_id: ctx.id,
      sender_id: userId,
      receiver_id: otherId,
      body: body.trim(),
    });
    setSending(false);
    if (sendErr) {
      setSendError(sendErr.message);
      return false;
    }
    return true;
  };

  const handleSend = async () => {
    const body = input.trim();
    if (!body) return;
    setInput("");
    const ok = await sendBody(body);
    if (!ok) setInput(body);
  };

  const sendChip = async (body: string) => {
    await sendBody(body);
  };

  if (loading) {
    return (
      <div className="min-h-svh flex flex-col bg-gray-50">
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-orange" />
        </main>
      </div>
    );
  }

  if (loadError || !ctx) {
    return (
      <div className="min-h-svh flex flex-col bg-gray-50">
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <AlertCircle className="w-12 h-12 text-orange mb-4" />
          <p className="font-heading text-lg font-bold text-navy mb-2">
            {loadError || "Something went wrong"}
          </p>
          <Link href="/profile/meetups" className="mt-4">
            <Button variant="outline" className="btn-large">
              Back to Meetups
            </Button>
          </Link>
        </main>
      </div>
    );
  }

  const isBuyer = userId === ctx.buyer_id;
  const otherParty = isBuyer ? ctx.seller : ctx.buyer;
  const otherName = otherParty?.full_name || "the other party";
  const otherFirst = otherName.split(" ")[0];

  const location = parseLocation(ctx.meetup_location);
  const dateLine = formatMeetupDate(
    ctx.meetup_window_start,
    ctx.meetup_window_end,
  );
  const offered = ctx.offered_price
    ? `$${(ctx.offered_price / 100).toFixed(0)}`
    : null;
  const directionsUrl = location
    ? getDirectionsUrl({
        lat: location.lat,
        lng: location.lng,
        address: location.address,
        label: location.name,
      })
    : null;

  const aceMessage = `Hey! 👋 Your meetup for ${
    ctx.listing?.title ?? "your item"
  } is confirmed.

📅 ${dateLine}
📍 ${location?.name ?? "TBD"}${
    offered ? `\n💰 ${offered}` : ""
  }

Use this chat to firm up the exact time with ${otherFirst}. Good luck! 🤝`;

  const showQuickReplies = messages.length < 3;
  const quickChips = [
    "👋 When works for you?",
    `📍 See you at ${location?.name ?? "the meetup spot"}!`,
    "✅ I'll be there on time!",
  ];

  let lastDayHeader = "";
  let lastTimestamp = 0;

  return (
    <div className="flex flex-col h-svh bg-gray-50">
      <header className="sticky top-0 bg-white border-b z-10">
        <div className="max-w-lg mx-auto px-3 h-14 flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="p-2 rounded-full hover:bg-gray-100"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-navy" />
          </button>
          <div className="w-9 h-9 rounded-full bg-orange flex items-center justify-center text-white font-bold flex-shrink-0">
            {otherParty?.full_name?.charAt(0) || (
              <UserIcon className="w-4 h-4" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-navy truncate text-sm">
              {otherName}
            </p>
            <Link
              href={`/meetups/${ctx.id}`}
              className="text-xs text-muted-foreground truncate block"
            >
              {ctx.listing?.title || "Meetup"}
            </Link>
          </div>
        </div>

        {/* Compact meetup details strip */}
        <div className="border-t bg-gray-50">
          <div className="max-w-lg mx-auto px-3 py-2 flex items-center gap-3 text-[12px]">
            <div className="flex items-center gap-1.5 text-navy/80 min-w-0">
              <Calendar className="w-3.5 h-3.5 flex-shrink-0 text-orange" />
              <span className="truncate">{dateLine}</span>
            </div>
            <div className="flex items-center gap-1.5 text-navy/80 min-w-0">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-orange" />
              <span className="truncate">{location?.name ?? "TBD"}</span>
            </div>
            {directionsUrl && (
              <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto flex-shrink-0 inline-flex items-center gap-1 text-orange font-semibold hover:underline"
              >
                <Navigation className="w-3 h-3" />
                Directions
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-3 py-4 space-y-2">
          {/* Ace opener — UI only, never persisted */}
          <div className="flex gap-2 items-start mt-2">
            <AceAvatar size={32} />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-orange mb-1 ml-1">
                Ace
              </p>
              <div className="max-w-[88%] rounded-2xl rounded-bl-md bg-navy text-white px-3.5 py-2.5">
                <p className="text-sm leading-relaxed whitespace-pre-line">
                  {aceMessage}
                </p>
              </div>
            </div>
          </div>

          {messages.length === 0 && showQuickReplies && (
            <div className="text-center pt-6 pb-2">
              <p className="text-xs text-muted-foreground font-semibold">
                Start the conversation 👇
              </p>
            </div>
          )}

          {messages.map((m) => {
            const mine = m.sender_id === userId;
            const dayHeader = formatDayHeader(m.created_at);
            const showDay = dayHeader !== lastDayHeader;
            lastDayHeader = dayHeader;
            const created = new Date(m.created_at).getTime();
            const showTime = created - lastTimestamp > 10 * 60 * 1000;
            lastTimestamp = created;

            return (
              <div key={m.id}>
                {showDay && (
                  <p className="text-center text-[11px] text-muted-foreground my-3 font-semibold">
                    {dayHeader}
                  </p>
                )}
                {showTime && (
                  <p className="text-center text-[10px] text-muted-foreground my-1">
                    {formatTime(m.created_at)}
                  </p>
                )}
                <div
                  className={`flex ${mine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[78%] rounded-2xl px-3.5 py-2 ${
                      mine
                        ? "bg-orange text-white rounded-br-md"
                        : "bg-white text-navy border rounded-bl-md"
                    }`}
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                      {m.body}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </main>

      <div
        className="sticky bottom-0 bg-white border-t"
        style={{
          paddingBottom: "max(16px, env(safe-area-inset-bottom))",
        }}
      >
        {showQuickReplies && (
          <div className="max-w-lg mx-auto px-3 pt-3 pb-1">
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {quickChips.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => sendChip(c)}
                  disabled={sending}
                  className="flex-shrink-0 h-9 px-3 rounded-full border border-orange/40 text-orange text-sm font-semibold hover:bg-orange/5 disabled:opacity-50"
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="max-w-lg mx-auto px-3 pt-3 flex gap-2 items-end">
          <Input
            placeholder="Message"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            className="input-large flex-1"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="btn-primary h-[52px] px-4"
          >
            {sending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        </div>
        {sendError && (
          <p className="max-w-lg mx-auto px-3 mt-2 text-xs text-red-600">
            {sendError}
          </p>
        )}
        {ctx.listing?.photo_urls?.[0] && (
          <Link
            href={`/listings/${ctx.listing.id}`}
            className="hidden"
            aria-hidden="true"
          >
            <ImageIcon />
          </Link>
        )}
      </div>
    </div>
  );
}

import { AuthGate } from "@/components/auth-gate";

export default function MeetupMessagesPage() {
  return (
    <AuthGate reason="Sign in to message the other party about your meetup.">
      <MeetupMessagesPageInner />
    </AuthGate>
  );
}
