"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Navbar } from "@/components/navbar";
import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { Loader2, Lock } from "lucide-react";

interface Props {
  reason: string;
  children: React.ReactNode;
}

export function AuthGate({ reason, children }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (alive) setAuthed(!!user);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session?.user);
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  if (authed === null) {
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

  if (!authed) {
    const redirect = encodeURIComponent(pathname || "/");
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-orange/10 flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-orange" />
          </div>
          <h1 className="font-heading text-2xl font-bold text-navy mb-2">
            Sign in to continue
          </h1>
          <p className="text-sm text-muted-foreground max-w-xs mb-6 leading-relaxed">
            {reason}
          </p>
          <div className="w-full max-w-xs space-y-2">
            <Link href={`/auth/login?redirect=${redirect}`}>
              <Button className="btn-large btn-primary">Sign In</Button>
            </Link>
            <Link href={`/auth/signup?redirect=${redirect}`}>
              <Button variant="outline" className="btn-large w-full">
                Create Account
              </Button>
            </Link>
            <Link
              href="/"
              className="block text-center text-sm text-muted-foreground py-2"
            >
              Keep browsing
            </Link>
          </div>
        </main>
        <BottomNav />
      </div>
    );
  }

  return <>{children}</>;
}
