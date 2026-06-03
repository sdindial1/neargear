"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Session } from "@supabase/supabase-js";

const ORANGE = "#ff6b35";

interface SignedInUser {
  id: string;
  email: string | null;
  full_name: string | null;
}

/**
 * Right-side nav action for the marketing landing page.
 *
 * The landing nav used to hardcode a "Sign In" link, so signed-in users were
 * told to sign in again even though their session was live (the marketplace
 * Navbar read it correctly — hence the mismatch). This mirrors the Navbar's
 * session handling but keeps the landing's translucent styling, and renders
 * nothing until auth has resolved so a logged-in user never flashes "Sign In".
 */
export function LandingNavAuth() {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<SignedInUser | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);

  useEffect(() => {
    let alive = true;

    const applySession = (session: Session | null) => {
      if (!alive) return;
      setAuthLoaded(true);
      if (!session?.user) {
        setUser(null);
        return;
      }
      setUser({
        id: session.user.id,
        email: session.user.email ?? null,
        full_name:
          (session.user.user_metadata?.full_name as string | undefined) ??
          null,
      });
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      applySession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  // Hold the slot until auth resolves so signed-in users never flash "Sign In".
  if (!authLoaded) {
    return <div aria-hidden className="h-8 w-8" />;
  }

  if (!user) {
    return (
      <Link
        href="/auth/login"
        className="text-xs font-bold uppercase tracking-widest text-white/90 transition hover:text-white md:text-sm"
      >
        Sign In
      </Link>
    );
  }

  const displayName = user.full_name || user.email || "";
  const initial = (displayName.charAt(0) || "?").toUpperCase();

  return (
    <div className="flex items-center gap-3 md:gap-4">
      <Link
        href="/marketplace"
        className="text-xs font-bold uppercase tracking-widest text-white/90 transition hover:text-white md:text-sm"
      >
        Marketplace &rarr;
      </Link>
      <Link
        href="/profile"
        aria-label="Your profile"
        className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white transition hover:opacity-90"
        style={{ backgroundColor: ORANGE }}
      >
        {initial}
      </Link>
    </div>
  );
}
