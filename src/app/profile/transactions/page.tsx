"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Navbar } from "@/components/navbar";
import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ImageIcon, Loader2 } from "lucide-react";

interface TxRow {
  id: string;
  meetup_id: string;
  listing_id: string | null;
  buyer_id: string | null;
  seller_id: string | null;
  gross_amount: number;
  platform_fee: number;
  net_amount: number;
  retail_price: number | null;
  auto_completed: boolean;
  created_at: string;
  listing?: { id: string; title: string; photo_urls: string[] } | null;
  buyer?: { full_name: string | null } | null;
  seller?: { full_name: string | null } | null;
}

function ProfileTransactionsInner() {
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
          `*,
           listing:listings!listing_id(id, title, photo_urls),
           buyer:users!buyer_id(full_name),
           seller:users!seller_id(full_name)`,
        )
        .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
        .order("created_at", { ascending: false });

      setRows((data as unknown as TxRow[]) || []);
      setLoading(false);
    };
    load();
  }, [supabase]);

  const totalEarnedCents = useMemo(() => {
    if (!userId) return 0;
    return rows
      .filter((t) => t.seller_id === userId)
      .reduce((sum, t) => sum + (t.net_amount || 0), 0);
  }, [rows, userId]);

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
          Transaction History
        </h1>

        {totalEarnedCents > 0 && (
          <div className="bg-white rounded-2xl border p-4 mb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">
              Total Earned
            </p>
            <p className="font-heading text-3xl font-bold text-orange tabular-nums">
              ${(totalEarnedCents / 100).toFixed(2)}
            </p>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No transactions yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((t) => {
              const isSeller = t.seller_id === userId;
              const other = isSeller ? t.buyer : t.seller;
              const date = new Date(t.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              });
              return (
                <Link
                  key={t.id}
                  href={`/profile/transactions/${t.id}`}
                  className="bg-white rounded-2xl border p-4 flex gap-3 items-start hover:opacity-95 block"
                >
                  <div className="w-16 h-16 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {t.listing?.photo_urls?.[0] ? (
                      <img
                        src={t.listing.photo_urls[0]}
                        alt={t.listing.title}
                        className="w-full h-full object-contain bg-white"
                      />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-gray-200" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-navy line-clamp-1">
                      {t.listing?.title || "Item"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {other?.full_name || "Other party"} · {date}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge
                        className={
                          isSeller
                            ? "bg-orange/10 text-orange"
                            : "bg-blue-100 text-blue-800"
                        }
                      >
                        {isSeller ? "Sold" : "Bought"}
                      </Badge>
                      <span className="font-bold text-navy tabular-nums">
                        $
                        {(
                          (isSeller ? t.net_amount : t.gross_amount) / 100
                        ).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

import { AuthGate } from "@/components/auth-gate";

export default function ProfileTransactionsPage() {
  return (
    <AuthGate reason="Sign in to see your transaction history.">
      <ProfileTransactionsInner />
    </AuthGate>
  );
}
