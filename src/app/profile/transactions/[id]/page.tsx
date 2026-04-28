"use client";

import { useEffect, useMemo, useState, use } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Navbar } from "@/components/navbar";
import { BottomNav } from "@/components/bottom-nav";
import { AuthGate } from "@/components/auth-gate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ImageIcon,
  Loader2,
  Receipt,
  Star,
  Calendar,
  MapPin,
  AlertTriangle,
} from "lucide-react";

interface TxDetail {
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
  listing?: {
    id: string;
    title: string;
    photo_urls: string[];
    sport: string | null;
    category: string | null;
    condition: string | null;
  } | null;
  buyer?: { id: string; full_name: string | null } | null;
  seller?: { id: string; full_name: string | null } | null;
  meetup?: {
    id: string;
    meetup_location: string | null;
    meetup_time: string | null;
  } | null;
}

function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function TransactionDetailInner({ id }: { id: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [tx, setTx] = useState<TxDetail | null>(null);
  const [hasReview, setHasReview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

      const { data, error: txError } = await supabase
        .from("transactions")
        .select(
          `*,
           listing:listings!listing_id(id, title, photo_urls, sport, category, condition),
           buyer:users!buyer_id(id, full_name),
           seller:users!seller_id(id, full_name),
           meetup:meetups!meetup_id(id, meetup_location, meetup_time)`,
        )
        .eq("id", id)
        .single();

      if (txError || !data) {
        setError("Transaction not found.");
        setLoading(false);
        return;
      }

      const t = data as unknown as TxDetail;
      if (t.buyer_id !== user.id && t.seller_id !== user.id) {
        setError("You don't have access to this transaction.");
        setLoading(false);
        return;
      }

      setTx(t);

      // Check if a review already exists from this user for this meetup
      const { data: review } = await supabase
        .from("reviews")
        .select("id")
        .eq("reviewer_id", user.id)
        .eq("listing_id", t.listing_id || "")
        .maybeSingle();
      setHasReview(!!review);

      setLoading(false);
    };
    load();
  }, [id, supabase]);

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

  if (error || !tx) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Navbar />
        <main className="page-with-nav flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <AlertTriangle className="w-12 h-12 mx-auto text-orange mb-3" />
            <p className="text-navy font-semibold">
              {error || "Transaction not found"}
            </p>
            <Link
              href="/profile/transactions"
              className="text-sm text-orange mt-3 inline-block"
            >
              Back to transactions
            </Link>
          </div>
        </main>
        <BottomNav />
      </div>
    );
  }

  const isSeller = tx.seller_id === userId;
  const counterparty = isSeller ? tx.buyer : tx.seller;
  const date = new Date(tx.created_at).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const meetupTime = tx.meetup?.meetup_time
    ? new Date(tx.meetup.meetup_time).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  const yourTake = isSeller ? tx.net_amount : tx.gross_amount;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="page-with-nav flex-1">
        <div className="max-w-md mx-auto w-full px-4 py-6">
          <Link
            href="/profile/transactions"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4"
          >
            <ChevronLeft className="w-4 h-4" /> All transactions
          </Link>

          {/* Header card */}
          <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <Badge
                className={
                  isSeller
                    ? "bg-orange/10 text-orange"
                    : "bg-blue-100 text-blue-800"
                }
              >
                <Receipt className="w-3 h-3 mr-1" />
                {isSeller ? "Sold" : "Bought"}
              </Badge>
              {tx.auto_completed && (
                <Badge className="bg-gray-100 text-gray-700">
                  Auto-completed
                </Badge>
              )}
            </div>

            <div className="flex gap-3 mb-4">
              <div className="w-20 h-20 rounded-xl bg-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                {tx.listing?.photo_urls?.[0] ? (
                  <img
                    src={tx.listing.photo_urls[0]}
                    alt={tx.listing.title}
                    className="w-full h-full object-contain bg-white"
                  />
                ) : (
                  <ImageIcon className="w-8 h-8 text-gray-300" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-heading text-lg font-bold text-navy line-clamp-2">
                  {tx.listing?.title || "Item"}
                </p>
                <p className="text-xs text-muted-foreground capitalize">
                  {[tx.listing?.sport, tx.listing?.category]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {isSeller ? "Buyer" : "Seller"}
                </span>
                <span className="font-semibold text-navy">
                  {counterparty?.full_name || "Other party"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" /> Date
                </span>
                <span className="font-semibold text-navy">{date}</span>
              </div>
              {tx.meetup?.meetup_location && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" /> Met at
                  </span>
                  <span className="font-semibold text-navy text-right max-w-[60%] truncate">
                    {tx.meetup.meetup_location}
                  </span>
                </div>
              )}
              {meetupTime && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Meetup time</span>
                  <span className="font-semibold text-navy">{meetupTime}</span>
                </div>
              )}
            </div>
          </div>

          {/* Money breakdown */}
          <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
            <h2 className="font-heading text-sm font-bold text-navy uppercase tracking-wide mb-3">
              Receipt
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sale price</span>
                <span className="font-semibold text-navy tabular-nums">
                  {formatMoney(tx.gross_amount)}
                </span>
              </div>
              {isSeller && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Platform fee</span>
                  <span className="text-muted-foreground tabular-nums">
                    -{formatMoney(tx.platform_fee)}
                  </span>
                </div>
              )}
              <div className="border-t pt-2 flex justify-between items-center">
                <span className="font-bold text-navy">
                  {isSeller ? "You earned" : "You paid"}
                </span>
                <span className="font-heading text-2xl font-bold text-orange tabular-nums">
                  {formatMoney(yourTake)}
                </span>
              </div>
              {tx.retail_price && (
                <p className="text-xs text-muted-foreground pt-2">
                  Retail price was {formatMoney(tx.retail_price)} —
                  {isSeller
                    ? " thanks for keeping gear in play."
                    : ` you saved ${formatMoney(tx.retail_price - tx.gross_amount)}.`}
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            {tx.listing_id && (
              <Link href={`/listings/${tx.listing_id}`}>
                <Button
                  variant="outline"
                  className="w-full min-h-[48px] border-navy/20 text-navy hover:bg-navy/5"
                >
                  View listing
                </Button>
              </Link>
            )}
            {!hasReview && tx.meetup_id && (
              <Link href={`/reviews/${tx.meetup_id}`}>
                <Button className="w-full min-h-[48px] bg-orange hover:bg-orange-light text-white">
                  <Star className="w-4 h-4" /> Leave a Review
                </Button>
              </Link>
            )}
          </div>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}

export default function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <AuthGate reason="Sign in to view your transactions.">
      <TransactionDetailInner id={id} />
    </AuthGate>
  );
}
