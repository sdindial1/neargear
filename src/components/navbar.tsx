"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Receipt, UserCircle, Wallet } from "lucide-react";

interface SignedInUser {
  id: string;
  email: string | null;
  full_name: string | null;
}

export function Navbar() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [user, setUser] = useState<SignedInUser | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!alive) return;
      if (!authUser) {
        setUser(null);
        return;
      }
      const { data: profile } = await supabase
        .from("users")
        .select("full_name")
        .eq("id", authUser.id)
        .maybeSingle();
      setUser({
        id: authUser.id,
        email: authUser.email ?? null,
        full_name: profile?.full_name ?? null,
      });
    };
    load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => load());
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const initial = (
    user?.full_name?.charAt(0) ||
    user?.email?.charAt(0) ||
    "?"
  ).toUpperCase();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <nav className="sticky top-0 z-50 bg-navy text-white shadow-lg safe-top">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          <Link
            href="/"
            className="flex items-center gap-1 text-xl font-bold font-heading"
          >
            <span className="text-white">Near</span>
            <span className="text-orange">Gear</span>
          </Link>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 text-sm cursor-pointer">
                <span className="hidden sm:inline text-white/80">
                  {user.full_name?.split(" ")[0] || "Hi"}
                </span>
                <span className="w-8 h-8 rounded-full bg-orange flex items-center justify-center text-white text-sm font-bold">
                  {initial}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  onClick={() => router.push("/profile")}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <UserCircle className="w-4 h-4" /> Profile
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => router.push("/profile/meetups")}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <UserCircle className="w-4 h-4" /> Meetups
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => router.push("/profile/transactions")}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Receipt className="w-4 h-4" /> Transactions
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => router.push("/profile/wallet")}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Wallet className="w-4 h-4" /> Wallet
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="flex items-center gap-2 text-red-600 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link href="/auth/login" className="text-sm text-white/70">
              Sign In
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
