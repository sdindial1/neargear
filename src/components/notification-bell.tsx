"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, X, Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

interface Props {
  userId: string;
}

const PAGE_SIZE = 30;

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

const TYPE_EMOJI: Record<string, string> = {
  meetup_request: "🤝",
  meetup_accepted: "✅",
  meetup_declined: "🙅",
  meetup_reminder: "⏰",
  transaction_complete: "💰",
  wishlist_reactivated: "🏷️",
  review_received: "⭐",
};

export function NotificationBell({ userId }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  // Initial unread count + realtime
  useEffect(() => {
    let alive = true;

    const refreshCount = async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("read", false);
      if (alive) setUnread(count ?? 0);
    };

    refreshCount();

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as NotificationRow;
          setItems((prev) =>
            prev.some((n) => n.id === row.id) ? prev : [row, ...prev],
          );
          if (!row.read) setUnread((u) => u + 1);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => refreshCount(),
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  // Load list when drawer opens
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE)
      .then(({ data }) => {
        if (alive) {
          setItems((data as NotificationRow[]) || []);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [open, supabase, userId]);

  const markAllRead = async () => {
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("read", false);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
  };

  const handleTap = async (n: NotificationRow) => {
    if (!n.read) {
      await supabase
        .from("notifications")
        .update({ read: true })
        .eq("id", n.id);
      setItems((prev) =>
        prev.map((row) => (row.id === n.id ? { ...row, read: true } : row)),
      );
      setUnread((u) => Math.max(0, u - 1));
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        className="relative p-2 rounded-full hover:bg-white/10"
      >
        <Bell className="w-5 h-5 text-white" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-navy">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-[80] bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-x-0 bottom-0 z-[81] bg-white rounded-t-3xl shadow-2xl flex flex-col h-[70dvh] max-h-[70dvh] ace-drawer-enter">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <p className="font-heading font-bold text-navy text-lg">
                Notifications
              </p>
              <div className="flex items-center gap-1">
                {unread > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="text-xs text-orange font-semibold px-2 py-1"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="p-2 rounded-full hover:bg-gray-100"
                >
                  <X className="w-5 h-5 text-navy" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto safe-bottom">
              {loading ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Loading…
                </div>
              ) : items.length === 0 ? (
                <div className="p-12 text-center">
                  <Inbox className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-navy font-semibold">
                    No notifications yet
                  </p>
                  <p className="text-sm text-muted-foreground mt-1 px-6">
                    We&apos;ll let you know when something happens.
                  </p>
                </div>
              ) : (
                <ul className="divide-y">
                  {items.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => handleTap(n)}
                        className={`w-full text-left px-4 py-3 flex gap-3 items-start hover:bg-gray-50 ${
                          !n.read ? "bg-orange/5" : ""
                        }`}
                      >
                        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-lg">
                          {TYPE_EMOJI[n.type] || "🔔"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <p
                              className={`text-sm ${
                                !n.read
                                  ? "font-bold text-navy"
                                  : "font-semibold text-navy/80"
                              }`}
                            >
                              {n.title}
                            </p>
                            <span className="text-[11px] text-muted-foreground flex-shrink-0">
                              {timeAgo(n.created_at)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {n.body}
                          </p>
                        </div>
                        {!n.read && (
                          <span className="w-2 h-2 mt-2 rounded-full bg-orange flex-shrink-0" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
