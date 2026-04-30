"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export type AcePage =
  | "listing"
  | "sell"
  | "browse"
  | "meetup"
  | "home"
  | "profile";

export interface AceContext {
  page: AcePage;
  user?: {
    firstName: string;
    city: string | null;
    zipcode: string | null;
  };
  listing?: {
    title: string;
    sport: string;
    condition: string;
    price: number;
    retailPrice: number | null;
    description: string | null;
    sellerCity: string | null;
  };
  meetup?: {
    status: string;
    date: string | null;
    timeWindow: string | null;
    location: string | null;
    offeredPrice: number | null;
  };
}

function detectPage(path: string): AcePage {
  if (path === "/" || path === "") return "home";
  if (path.startsWith("/sell")) return "sell";
  if (path.startsWith("/browse")) return "browse";
  if (path.startsWith("/listings/")) return "listing";
  if (path.startsWith("/meetups/")) return "meetup";
  if (path.startsWith("/profile")) return "profile";
  return "home";
}

export function useAceContext(): AceContext {
  const pathname = usePathname() ?? "/";
  const supabase = useMemo(() => createClient(), []);
  const [ctx, setCtx] = useState<AceContext>({ page: detectPage(pathname) });
  const [authUser, setAuthUser] = useState<User | null>(null);

  // Subscribe once to auth state — avoids competing getUser() calls that
  // race with the SDK's internal auth lock and surface as
  // "Lock was released because another request stole it".
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (alive) setAuthUser(session?.user ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    let alive = true;
    const page = detectPage(pathname);

    const load = async () => {
      const next: AceContext = { page };

      const user = authUser;
      if (user) {
        const { data: profile } = await supabase
          .from("users")
          .select("full_name, city, zipcode")
          .eq("id", user.id)
          .maybeSingle();
        next.user = {
          firstName:
            (profile?.full_name as string | undefined)?.split(" ")[0] ?? "",
          city: (profile?.city as string | null) ?? null,
          zipcode: (profile?.zipcode as string | null) ?? null,
        };
      }

      if (page === "listing") {
        const id = pathname.split("/")[2];
        if (id) {
          const { data } = await supabase
            .from("listings")
            .select(
              "title, sport, condition, price, retail_price, description, city, seller:users!seller_id(city)",
            )
            .eq("id", id)
            .maybeSingle();
          if (data) {
            const seller = (
              data as unknown as { seller?: { city?: string | null } | null }
            ).seller;
            next.listing = {
              title: (data.title as string) ?? "",
              sport: (data.sport as string) ?? "",
              condition: (data.condition as string) ?? "",
              price: (data.price as number) ?? 0,
              retailPrice: (data.retail_price as number | null) ?? null,
              description: (data.description as string | null) ?? null,
              sellerCity:
                (seller?.city as string | null) ??
                (data.city as string | null) ??
                null,
            };
          }
        }
      }

      if (page === "meetup") {
        const id = pathname.split("/")[2];
        if (id) {
          const { data } = await supabase
            .from("meetups")
            .select(
              "status, meetup_window_start, meetup_window_end, meetup_location, offered_price",
            )
            .eq("id", id)
            .maybeSingle();
          if (data) {
            let locName: string | null = null;
            try {
              if (data.meetup_location)
                locName = JSON.parse(data.meetup_location as string).name ?? null;
            } catch {}
            const start = data.meetup_window_start
              ? new Date(data.meetup_window_start as string)
              : null;
            const end = data.meetup_window_end
              ? new Date(data.meetup_window_end as string)
              : null;
            next.meetup = {
              status: (data.status as string) ?? "",
              date: start
                ? start.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })
                : null,
              timeWindow:
                start && end
                  ? `${start.toLocaleTimeString("en-US", { hour: "numeric", hour12: true })} – ${end.toLocaleTimeString("en-US", { hour: "numeric", hour12: true })}`
                  : null,
              location: locName,
              offeredPrice: (data.offered_price as number | null) ?? null,
            };
          }
        }
      }

      if (alive) setCtx(next);
    };

    load();
    return () => {
      alive = false;
    };
  }, [pathname, supabase, authUser]);

  return ctx;
}

export function suggestedPrompts(ctx: AceContext): string[] {
  switch (ctx.page) {
    case "listing":
      return [
        "Is this a fair price?",
        "Will this fit my kid?",
        "What should I look for at meetup?",
        "Help me make an offer",
      ];
    case "sell":
      return [
        "How do I take better photos?",
        "Help me price this item",
        "What info do I need to add?",
        "Will this sell quickly?",
      ];
    case "browse":
      return [
        "Find gear for my kid",
        "What size does my kid need?",
        "What's a fair price for used gear?",
        "How does buying work?",
      ];
    case "meetup":
      return [
        "What should I bring?",
        "Is this meetup safe?",
        "What if the item isn't as described?",
        "How do I complete the transaction?",
      ];
    default:
      return [
        "How does NearGear work?",
        "Help me sell my gear",
        "Find gear for my kid",
        "What sports do you cover?",
      ];
  }
}
