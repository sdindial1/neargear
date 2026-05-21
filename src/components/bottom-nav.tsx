"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, Home, MessageCircle, Plus, UserCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Marketing/auth surfaces — bottom nav hides here.
const HIDE_EXACT = new Set(["/"]);
const HIDE_PREFIXES = ["/auth", "/admin", "/founding"];

export function BottomNav() {
  const pathname = usePathname() ?? "/";
  const supabase = useMemo(() => createClient(), []);
  const [unreadCount, setUnreadCount] = useState(0);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  // Auth presence
  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (alive) setSignedIn(!!user);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session?.user);
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  // Unread message count — refreshes on route change so the badge stays current.
  useEffect(() => {
    if (!signedIn) {
      setUnreadCount(0);
      return;
    }
    let cancelled = false;
    const fetchUnread = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { count } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("receiver_id", user.id)
        .eq("read", false);
      if (!cancelled) setUnreadCount(count ?? 0);
    };
    fetchUnread();
    return () => {
      cancelled = true;
    };
  }, [pathname, signedIn, supabase]);

  // Hide on marketing surfaces and for signed-out users.
  if (HIDE_EXACT.has(pathname)) return null;
  if (HIDE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return null;
  }
  if (signedIn === null || !signedIn) return null;

  const items = [
    { href: "/marketplace", icon: Home, label: "Home" },
    { href: "/saved", icon: Heart, label: "Saved" },
    { href: "/sell", icon: Plus, label: "Sell", isSell: true },
    {
      href: "/messages",
      icon: MessageCircle,
      label: "Messages",
      badge: unreadCount,
    },
    { href: "/profile", icon: UserCircle, label: "Profile" },
  ];

  return (
    <div className="bottom-nav md:hidden">
      {items.map((item) => {
        const isActive = pathname.startsWith(item.href);

        if (item.isSell) {
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center"
            >
              <div className="bottom-nav-sell">
                <Plus className="w-7 h-7" strokeWidth={2.5} />
              </div>
              <span className="text-[10px] font-medium text-orange mt-0.5">
                {item.label}
              </span>
            </Link>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`bottom-nav-item ${isActive ? "active" : ""}`}
          >
            <item.icon className="w-6 h-6" />
            <span>{item.label}</span>
            {item.badge && item.badge > 0 ? (
              <span className="unread-badge">
                {item.badge > 9 ? "9+" : item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
