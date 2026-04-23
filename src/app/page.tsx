import { createServerSupabaseClient } from "@/lib/supabase-server";
import { Navbar } from "@/components/navbar";
import { BottomNav } from "@/components/bottom-nav";
import { SportsTicker } from "@/components/sports-ticker";
import { ListingCard } from "@/components/listing-card";
import { ListingCardSkeleton } from "@/components/listing-card-skeleton";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import type { Listing, User } from "@/types/database";
import { SPORTS } from "@/lib/constants";

async function FeaturedListings() {
  const supabase = await createServerSupabaseClient();
  const { data: listings } = await supabase
    .from("listings")
    .select("*, seller:users!seller_id(full_name, avg_rating, city)")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(6);

  if (!listings || listings.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground px-4">
        <p className="text-lg">No listings yet. Be the first to post!</p>
        <Link href="/sell">
          <Button className="mt-4 btn-large btn-primary max-w-xs mx-auto">
            Create a Listing
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
      {listings.map((listing: Listing & { seller: Pick<User, "full_name" | "avg_rating" | "city"> }) => (
        <ListingCard key={listing.id} listing={listing} />
      ))}
    </div>
  );
}

function FeaturedSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <ListingCardSkeleton key={i} />
      ))}
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />

      <main className="page-with-nav">
        {/* Hero */}
        <section className="bg-navy text-white">
          <div className="max-w-7xl mx-auto px-4 py-10 md:py-20">
            <div className="max-w-2xl">
              <h1 className="font-heading text-3xl sm:text-4xl md:text-5xl font-bold leading-tight">
                Buy & Sell Sports Gear{" "}
                <span className="text-orange">Locally in DFW</span>
              </h1>
              <p className="mt-4 text-base text-white/60 max-w-md">
                AI-powered marketplace for parents and coaches. Snap photos, AI does the rest.
              </p>
              <p className="mt-2 text-sm text-orange font-semibold">
                Free to list. Only pay when you swap.
              </p>
              <div className="mt-6">
                <Link href="/browse" className="w-full sm:w-auto">
                  <Button className="btn-large btn-primary sm:w-auto sm:px-8">
                    Browse Listings <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Sports Categories - horizontal scroll */}
        <section className="border-b">
          <div className="max-w-7xl mx-auto px-4 py-3">
            <div className="sports-scroll">
              {SPORTS.map((sport) => (
                <Link key={sport} href={`/browse?sport=${encodeURIComponent(sport)}`}>
                  <div className="sport-pill">{sport}</div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Featured Listings */}
        <section className="py-6 md:py-12">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-center justify-between mb-4 md:mb-6">
              <h2 className="font-heading text-xl md:text-2xl font-bold text-navy">
                Near You
              </h2>
              <Link
                href="/browse"
                className="text-orange hover:text-orange-light font-semibold flex items-center gap-1 text-sm transition-colors"
              >
                View all <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <Suspense fallback={<FeaturedSkeleton />}>
              <FeaturedListings />
            </Suspense>
          </div>
        </section>
      </main>

      {/* Footer - desktop only */}
      <footer className="hidden md:block mt-auto bg-navy text-white/60 py-6">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm">
          <span className="text-white font-heading font-semibold">Sport</span>
          <span className="text-orange font-heading font-semibold">Swap</span>{" "}
          &copy; {new Date().getFullYear()} &mdash; DFW&apos;s Sports Gear Marketplace
        </div>
      </footer>

      <BottomNav />
    </div>
  );
}
