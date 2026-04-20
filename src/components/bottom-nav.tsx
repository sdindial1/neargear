"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, Plus, MessageCircle, UserCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function BottomNav() {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    async function fetchUnread() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { count } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("receiver_id", user.id)
        .eq("read", false);
      setUnreadCount(count || 0);
    }
    fetchUnread();
  }, [pathname]);

  const items = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/browse", icon: Search, label: "Browse" },
    { href: "/sell", icon: Plus, label: "Sell", isSell: true },
    { href: "/messages", icon: MessageCircle, label: "Messages", badge: unreadCount },
    { href: "/profile", icon: UserCircle, label: "Profile" },
  ];

  return (
    <div className="bottom-nav md:hidden">
      {items.map((item) => {
        const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

        if (item.isSell) {
          return (
            <Link key={item.href} href={item.href} className="flex flex-col items-center">
              <div className="bottom-nav-sell">
                <Plus className="w-7 h-7" strokeWidth={2.5} />
              </div>
              <span className="text-[10px] font-medium text-orange mt-0.5">{item.label}</span>
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
              <span className="unread-badge">{item.badge > 9 ? "9+" : item.badge}</span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
