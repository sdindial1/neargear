"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertCircle,
  ArrowLeft,
  ImageIcon,
  Loader2,
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
  buyer?: { id: string; full_name: string | null };
  seller?: { id: string; full_name: string | null };
  listing?: { id: string; title: string; photo_urls: string[] };
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
          `id, buyer_id, seller_id, listing_id,
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

      const orFilter = `and(sender_id.eq.${meetupCtx.buyer_id},receiver_id.eq.${meetupCtx.seller_id}),and(sender_id.eq.${meetupCtx.seller_id},receiver_id.eq.${meetupCtx.buyer_id})`;
      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .eq("listing_id", meetupCtx.listing_id)
        .or(orFilter)
        .order("created_at", { ascending: true });
      setMessages((msgs as Msg[]) || []);

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
          const m = payload.new as Msg;
          const isOurThread =
            (m.sender_id === ctx.buyer_id && m.receiver_id === ctx.seller_id) ||
            (m.sender_id === ctx.seller_id && m.receiver_id === ctx.buyer_id);
          if (!isOurThread) return;
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

  const handleSend = async () => {
    if (!ctx || !userId || !input.trim() || sending) return;
    setSending(true);
    setSendError("");
    const body = input.trim();
    const otherId =
      userId === ctx.buyer_id ? ctx.seller_id : ctx.buyer_id;
    setInput("");

    const { error: sendErr } = await supabase.from("messages").insert({
      listing_id: ctx.listing_id,
      sender_id: userId,
      receiver_id: otherId,
      body,
    });
    setSending(false);
    if (sendErr) {
      setSendError(sendErr.message);
      setInput(body);
    }
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
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-3 py-4 space-y-1">
          <div className="text-center text-xs text-muted-foreground bg-white border rounded-xl px-4 py-3 mb-2">
            You&apos;re now connected with{" "}
            <span className="font-semibold text-navy">{otherName}</span>. Use
            this to firm up your meetup time and location.
          </div>

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

      <div className="sticky bottom-0 bg-white border-t p-3 safe-bottom">
        <div className="max-w-lg mx-auto flex gap-2 items-end">
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
          <p className="max-w-lg mx-auto mt-2 text-xs text-red-600">
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
