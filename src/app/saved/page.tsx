"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Navbar } from "@/components/navbar";
import { BottomNav } from "@/components/bottom-nav";
import { AuthGate } from "@/components/auth-gate";
import { ListingCard } from "@/components/listing-card";
import { ListingCardSkeleton } from "@/components/listing-card-skeleton";
import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";
import type { Listing, User } from "@/types/database";

type ListingWithSeller = Listing & {
  seller?: Pick<User, "full_name" | "avg_rating" | "city">;
};

interface SavedRow {
  created_at: string;
  listing: ListingWithSeller | null;
}

function SavedInner() {
  const supabase = useMemo(() => createClient(), []);
  const [listings, setListings] = useState<ListingWithSeller[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }
      // Join through saved_listings so we get only listings the user saved,
      // ordered by most-recently-saved.
      const { data } = await supabase
        .from("saved_listings")
        .select(
          `created_at, listing:listings!listing_id(
            *, seller:public_profiles!seller_id(full_name, avg_rating, city)
          )`,
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (cancelled) return;
      const rows = (data as SavedRow[] | null) ?? [];
      // Drop entries whose listing is gone or no longer active.
      const visible = rows
        .map((r) => r.listing)
        .filter((l): l is ListingWithSeller => !!l && l.status === "active");
      setListings(visible);
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />

      <main className="page-with-nav flex-1">
        <div className="max-w-7xl mx-auto w-full px-4 py-6">
          <h1 className="font-heading text-2xl font-bold text-navy">
            Saved Gear
          </h1>
          <p className="text-sm text-muted-foreground mt-1 mb-5">
            Listings you&apos;re keeping an eye on.
          </p>

          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <ListingCardSkeleton key={i} />
              ))}
            </div>
          ) : listings.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="w-16 h-16 rounded-full bg-orange/10 flex items-center justify-center mx-auto mb-4">
                <Heart className="w-8 h-8 text-orange" />
              </div>
              <p className="font-heading text-lg font-semibold text-navy">
                No saved listings yet
              </p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
                Tap the heart on any listing to save it for later.
              </p>
              <Link href="/marketplace" className="inline-block mt-6">
                <Button className="btn-large btn-primary max-w-xs mx-auto">
                  Browse Gear
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
              {listings.map((l) => (
                <ListingCard key={l.id} listing={l} initiallySaved />
              ))}
            </div>
          )}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}

export default function SavedPage() {
  return (
    <AuthGate reason="Sign in to see the gear you've saved.">
      <SavedInner />
    </AuthGate>
  );
}
