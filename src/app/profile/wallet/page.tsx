"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Navbar } from "@/components/navbar";
import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wallet } from "lucide-react";

interface TxRow {
  id: string;
  net_amount: number;
  gross_amount: number;
  created_at: string;
  listing?: { title: string } | null;
}

function WalletInner() {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);

      const { data } = await supabase
        .from("transactions")
        .select(
          "id, net_amount, gross_amount, created_at, listing:listings!listing_id(title)",
        )
        .eq("seller_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);

      setRows((data as unknown as TxRow[]) || []);
      setLoading(false);
    };
    load();
  }, [supabase]);

  const balanceCents = useMemo(
    () => rows.reduce((sum, t) => sum + (t.net_amount || 0), 0),
    [rows],
  );

  if (loading) {
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

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-5 page-with-nav">
        <h1 className="font-heading text-2xl font-bold text-navy mb-4">
          My Wallet
        </h1>

        <div className="bg-navy text-white rounded-2xl p-6 mb-5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs uppercase tracking-wide font-semibold text-white/60">
              Available Balance
            </p>
            <Badge className="bg-orange/20 text-orange border-0">
              Payout coming soon
            </Badge>
          </div>
          <p className="font-heading text-4xl font-bold text-white tabular-nums">
            ${(balanceCents / 100).toFixed(2)}
          </p>
          <Button
            disabled
            title="Payouts enabled in next update"
            className="mt-5 w-full bg-white/10 text-white/60 border border-white/20 hover:bg-white/10 disabled:opacity-100 cursor-not-allowed"
          >
            <Wallet className="w-4 h-4" /> Withdraw
          </Button>
          <p className="text-[11px] text-white/50 mt-2 text-center">
            Stripe Connect lands in Session 6.
          </p>
        </div>

        <div className="flex items-center justify-between mb-2">
          <h2 className="font-heading text-lg font-bold text-navy">
            Recent activity
          </h2>
          <Link
            href="/profile/transactions"
            className="text-sm text-orange font-semibold"
          >
            See all
          </Link>
        </div>

        {rows.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground bg-white rounded-2xl border">
            <p className="text-sm">No transactions yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((t) => (
              <div
                key={t.id}
                className="bg-white rounded-xl border p-3 flex items-center justify-between"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-navy truncate">
                    {t.listing?.title || "Item"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(t.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <p className="font-bold text-orange tabular-nums">
                  +${(t.net_amount / 100).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

import { AuthGate } from "@/components/auth-gate";

export default function WalletPage() {
  return (
    <AuthGate reason="Sign in to see your wallet and earnings.">
      <WalletInner />
    </AuthGate>
  );
}
