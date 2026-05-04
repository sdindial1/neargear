"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  type ActiveProfile,
  writeActiveProfileToStorage,
} from "@/lib/active-profile";

interface Props {
  /**
   * Compact = small "Meeting as: X ▾" pill (use in messages header).
   * Default = navbar variant: white text, slightly larger.
   */
  variant?: "navbar" | "compact";
  className?: string;
}

interface Profile {
  full_name: string | null;
  spouse_name: string | null;
  active_profile: ActiveProfile | null;
}

export function ProfileSwitcher({ variant = "navbar", className }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!alive || !user) return;
      setUserId(user.id);
      const { data } = await supabase
        .from("users")
        .select("full_name, spouse_name, active_profile")
        .eq("id", user.id)
        .maybeSingle();
      if (!alive || !data) return;
      setProfile(data as Profile);
    })();
    return () => {
      alive = false;
    };
  }, [supabase]);

  if (!userId || !profile?.spouse_name) return null;

  const active: ActiveProfile =
    profile.active_profile === "spouse" ? "spouse" : "primary";
  const activeName =
    active === "spouse" ? profile.spouse_name : profile.full_name ?? "";
  const activeFirst = activeName.split(/\s+/)[0] || activeName;

  const switchTo = async (next: ActiveProfile) => {
    if (next === active || busy) return;
    setBusy(true);
    setProfile((p) => (p ? { ...p, active_profile: next } : p));
    writeActiveProfileToStorage(next);
    const { error } = await supabase
      .from("users")
      .update({ active_profile: next })
      .eq("id", userId);
    setBusy(false);
    if (error) {
      // Revert on failure.
      setProfile((p) => (p ? { ...p, active_profile: active } : p));
      writeActiveProfileToStorage(active);
      return;
    }
    // Soft refresh so server components pick up the change.
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("neargear:profile-switched"));
    }
  };

  const triggerClass =
    variant === "compact"
      ? "inline-flex items-center gap-1 text-xs text-muted-foreground bg-gray-100 rounded-full px-2.5 py-1"
      : "inline-flex items-center gap-1 text-[11px] text-white/70 hover:text-white";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`${triggerClass} ${className ?? ""}`}
        aria-label="Switch active profile"
      >
        <span>Meeting as:</span>
        <span className="font-semibold">{activeFirst}</span>
        <ChevronDown className="w-3 h-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => switchTo("primary")}
        >
          {active === "primary" ? (
            <Check className="w-4 h-4 text-orange" />
          ) : (
            <span className="w-4" />
          )}
          <span className="ml-2 truncate">
            {profile.full_name ?? "Primary"}{" "}
            <span className="text-muted-foreground text-xs">(you)</span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => switchTo("spouse")}
        >
          {active === "spouse" ? (
            <Check className="w-4 h-4 text-orange" />
          ) : (
            <span className="w-4" />
          )}
          <span className="ml-2 truncate">{profile.spouse_name}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
