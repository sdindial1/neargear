"use client";

import { useEffect, useMemo, useState } from "react";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface ReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer: {
    full_name: string | null;
  } | null;
}

interface Props {
  sellerId: string;
  sellerName: string;
  initialAvgRating: number | null;
  initialReviewCount: number | null;
}

const PAGE_SIZE = 5;

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86400000);
  if (days < 1) return "today";
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

export function SellerReviews({
  sellerId,
  sellerName,
  initialAvgRating,
  initialReviewCount,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    supabase
      .from("reviews")
      .select(
        "id, rating, comment, created_at, reviewer:users!reviewer_id(full_name)",
      )
      .eq("reviewee_id", sellerId)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE)
      .then(({ data }) => {
        if (!alive) return;
        setReviews((data as unknown as ReviewRow[]) || []);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [supabase, sellerId]);

  const count = initialReviewCount ?? 0;
  const avg = initialAvgRating ?? 0;

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm mt-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading font-semibold text-navy">
          Seller reviews
        </h3>
        {count > 0 && (
          <div className="flex items-center gap-1 text-sm">
            <Star className="w-4 h-4 fill-orange text-orange" />
            <span className="font-bold text-navy">{avg.toFixed(1)}</span>
            <span className="text-muted-foreground">
              ({count})
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading reviews…</p>
      ) : reviews.length === 0 ? (
        <div className="text-center py-3">
          <p className="text-sm text-navy font-semibold">No reviews yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Be the first to review {sellerName}.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => {
            const reviewerName = r.reviewer?.full_name || "Buyer";
            const initial = reviewerName.charAt(0).toUpperCase();
            const firstName = reviewerName.split(" ")[0];
            return (
              <li key={r.id} className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-navy/10 text-navy flex items-center justify-center text-sm font-bold flex-shrink-0">
                  {initial}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <p className="font-semibold text-navy text-sm">
                      {firstName}
                    </p>
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`w-3 h-3 ${
                            s <= r.rating
                              ? "fill-orange text-orange"
                              : "text-gray-300"
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {timeAgo(r.created_at)}
                    </span>
                  </div>
                  {r.comment && (
                    <p className="text-sm text-navy/90 mt-1 leading-relaxed">
                      {r.comment}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
