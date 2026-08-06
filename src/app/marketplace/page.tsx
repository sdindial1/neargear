"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Navbar } from "@/components/navbar";
import { BottomNav } from "@/components/bottom-nav";
import { ListingCard } from "@/components/listing-card";
import { ListingCardSkeleton } from "@/components/listing-card-skeleton";
import { SizeRecommendation } from "@/components/size-recommendation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SPORTS, CONDITIONS, DFW_CITIES } from "@/lib/constants";
import { formatCondition } from "@/lib/utils";
import { ArrowRight, Loader2, Search, ShoppingBag, SlidersHorizontal, X } from "lucide-react";
import type { Listing, User } from "@/types/database";

type ListingWithSeller = Listing & {
  seller?: Pick<User, "full_name" | "avg_rating" | "city">;
};

const PAGE_SIZE = 20;

const PRICE_BUCKETS: Array<{
  label: string;
  min: number | null;
  max: number | null;
}> = [
  { label: "Under $25", min: null, max: 25 },
  { label: "$25–$50", min: 25, max: 50 },
  { label: "$50–$100", min: 50, max: 100 },
  { label: "$100+", min: 100, max: null },
];

export default function MarketplacePage() {
  return (
    <Suspense fallback={<LoadingShell />}>
      <MarketplaceContent />
    </Suspense>
  );
}

function LoadingShell() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="page-with-nav flex-1">
        <div className="max-w-7xl mx-auto w-full px-4 py-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <ListingCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}

function MarketplaceContent() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();

  const [listings, setListings] = useState<ListingWithSeller[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [sportFilter, setSportFilter] = useState(
    searchParams.get("sport") || "all",
  );
  const [conditionFilter, setConditionFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [priceMin, setPriceMin] = useState<string>("");
  const [priceMax, setPriceMax] = useState<string>("");
  const [childAge, setChildAge] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

  // Debounce the search input so we don't fire a query on every keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(id);
  }, [search]);

  const buildQuery = (from: number, to: number) => {
    let query = supabase
      .from("listings")
      .select("*, seller:public_profiles!seller_id(full_name, avg_rating, city)")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (sportFilter !== "all") query = query.eq("sport", sportFilter);
    if (conditionFilter !== "all") query = query.eq("condition", conditionFilter);
    if (cityFilter !== "all") query = query.eq("city", cityFilter);

    const minCents = priceMin ? parseFloat(priceMin) * 100 : null;
    const maxCents = priceMax ? parseFloat(priceMax) * 100 : null;
    if (minCents != null && !Number.isNaN(minCents)) query = query.gte("price", minCents);
    if (maxCents != null && !Number.isNaN(maxCents)) query = query.lte("price", maxCents);

    const ageNum = childAge ? parseInt(childAge, 10) : null;
    if (ageNum != null && !Number.isNaN(ageNum)) {
      query = query.lte("age_min", ageNum).gte("age_max", ageNum);
    }

    const term = debouncedSearch.trim();
    if (term) {
      // Title ILIKE is sufficient for the seed data; we'd want full-text later.
      query = query.ilike("title", `%${term}%`);
    }

    return query;
  };

  // Refetch from offset 0 whenever filters change.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      const { data } = await buildQuery(0, PAGE_SIZE - 1);
      if (cancelled) return;
      const rows = (data as ListingWithSeller[]) ?? [];
      setListings(rows);
      setHasMore(rows.length === PAGE_SIZE);
      setLoading(false);
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    supabase,
    sportFilter,
    conditionFilter,
    cityFilter,
    priceMin,
    priceMax,
    childAge,
    debouncedSearch,
  ]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const from = listings.length;
    const { data } = await buildQuery(from, from + PAGE_SIZE - 1);
    const rows = (data as ListingWithSeller[]) ?? [];
    setListings((prev) => [...prev, ...rows]);
    setHasMore(rows.length === PAGE_SIZE);
    setLoadingMore(false);
  };

  // Live updates — only prepend rows that match the current filters.
  useEffect(() => {
    const channel = supabase
      .channel("marketplace-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "listings" },
        (payload) => {
          const row = payload.new as Listing;
          if (row.status !== "active") return;
          if (sportFilter !== "all" && row.sport !== sportFilter) return;
          setListings((prev) =>
            prev.some((p) => p.id === row.id) ? prev : [row, ...prev],
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, sportFilter]);

  const ageNum = childAge ? parseInt(childAge, 10) : null;

  const activeChips: Array<{ label: string; clear: () => void }> = [];
  if (sportFilter !== "all") {
    activeChips.push({ label: sportFilter, clear: () => setSportFilter("all") });
  }
  if (conditionFilter !== "all") {
    activeChips.push({
      label: formatCondition(conditionFilter),
      clear: () => setConditionFilter("all"),
    });
  }
  if (cityFilter !== "all") {
    activeChips.push({ label: cityFilter, clear: () => setCityFilter("all") });
  }
  if (priceMin || priceMax) {
    activeChips.push({
      label: `$${priceMin || "0"}–$${priceMax || "∞"}`,
      clear: () => {
        setPriceMin("");
        setPriceMax("");
      },
    });
  }
  if (ageNum != null && !Number.isNaN(ageNum)) {
    activeChips.push({ label: `Age ${ageNum}`, clear: () => setChildAge("") });
  }

  const clearAll = () => {
    setSportFilter("all");
    setConditionFilter("all");
    setCityFilter("all");
    setPriceMin("");
    setPriceMax("");
    setChildAge("");
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />

      <main className="page-with-nav flex-1">
        {/* Hero */}
        <section className="bg-navy text-white">
          <div className="max-w-7xl mx-auto px-4 py-8 md:py-14">
            <div className="max-w-2xl">
              <h1 className="font-heading text-3xl sm:text-4xl md:text-5xl font-bold leading-tight">
                Buy & Sell Sports Gear{" "}
                <span className="text-orange">Locally in DFW</span>
              </h1>
              <p className="mt-3 text-sm md:text-base text-white/60 max-w-md">
                AI-powered marketplace for parents and coaches. Snap photos, AI does the rest.
              </p>
              <p className="mt-1 text-xs md:text-sm text-orange font-semibold">
                Free to list. Only pay when you sell.
              </p>
            </div>

            {/* Search */}
            <div className="mt-5 max-w-2xl">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-navy/50" />
                <Input
                  type="search"
                  inputMode="search"
                  placeholder="Search gear, brands, or sports…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-white text-navy pl-10 h-12 text-base rounded-xl border-0 shadow-md"
                />
                {search && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-navy/60 hover:text-navy"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        <div className="max-w-7xl mx-auto w-full px-4 py-4">
          {/* Title + filters button */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading text-xl font-bold text-navy">
              {activeChips.length > 0 || debouncedSearch ? "Results" : "All Gear"}
            </h2>
            <button
              onClick={() => setShowFilters(true)}
              className="relative flex items-center gap-1.5 px-3 h-10 rounded-xl border bg-white hover:bg-gray-50 text-sm font-medium text-navy"
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filters
              {activeChips.length > 0 && (
                <span className="w-5 h-5 rounded-full bg-orange text-white text-[10px] font-bold flex items-center justify-center">
                  {activeChips.length}
                </span>
              )}
            </button>
          </div>

          {/* Sport pills */}
          <div className="sports-scroll mb-3">
            <button
              className={`sport-pill ${sportFilter === "all" ? "active" : ""}`}
              onClick={() => setSportFilter("all")}
            >
              All
            </button>
            {SPORTS.map((s) => (
              <button
                key={s}
                className={`sport-pill ${sportFilter === s ? "active" : ""}`}
                onClick={() => setSportFilter(s)}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Active filter chips */}
          {activeChips.length > 0 && (
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {activeChips.map((chip, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 bg-navy/5 text-navy text-xs font-medium rounded-full px-3 py-1"
                >
                  {chip.label}
                  <button
                    type="button"
                    onClick={chip.clear}
                    aria-label={`Clear ${chip.label}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-orange font-semibold"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Grid */}
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <ListingCardSkeleton key={i} />
              ))}
            </div>
          ) : listings.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="w-16 h-16 rounded-full bg-orange/10 flex items-center justify-center mx-auto mb-4">
                <ShoppingBag className="w-8 h-8 text-orange" />
              </div>
              <p className="font-heading text-lg font-semibold text-navy">
                No listings found
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Try adjusting your filters — or be the first to list!
              </p>
              <Link href="/sell">
                <Button className="btn-large btn-primary max-w-xs mx-auto mt-6">
                  Sell Your Gear
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                {listings.map((l) => (
                  <ListingCard key={l.id} listing={l} />
                ))}
              </div>
              {hasMore && (
                <div className="flex justify-center mt-8">
                  <Button
                    variant="outline"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="min-h-[44px] px-8"
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                      </>
                    ) : (
                      <>
                        Load more <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Filter drawer */}
      {showFilters && (
        <div className="fixed inset-0 z-50" onClick={() => setShowFilters(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="filter-drawer open"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="filter-drawer-handle" />
            <div className="px-4 pb-6 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4 sticky top-0 bg-white pt-2 pb-2">
                <h3 className="font-heading text-lg font-bold text-navy">
                  Filters
                </h3>
                <button onClick={() => setShowFilters(false)} className="p-2">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-5">
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-navy">Sport</Label>
                  <Select
                    value={sportFilter}
                    onValueChange={(v) => setSportFilter(v ?? "all")}
                  >
                    <SelectTrigger className="min-h-[44px]">
                      <SelectValue placeholder="All Sports" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sports</SelectItem>
                      {SPORTS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-navy">
                    Condition
                  </Label>
                  <Select
                    value={conditionFilter}
                    onValueChange={(v) => setConditionFilter(v ?? "all")}
                  >
                    <SelectTrigger className="min-h-[44px] bg-white">
                      <SelectValue placeholder="Any Condition">
                        {(v: string) =>
                          !v || v === "all"
                            ? "Any Condition"
                            : formatCondition(v)
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any Condition</SelectItem>
                      {CONDITIONS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {formatCondition(c.value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-navy">Price</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      min="0"
                      placeholder="Min"
                      value={priceMin}
                      onChange={(e) => setPriceMin(e.target.value)}
                      className="min-h-[44px]"
                    />
                    <Input
                      type="number"
                      min="0"
                      placeholder="Max"
                      value={priceMax}
                      onChange={(e) => setPriceMax(e.target.value)}
                      className="min-h-[44px]"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {PRICE_BUCKETS.map((b) => (
                      <button
                        key={b.label}
                        type="button"
                        onClick={() => {
                          setPriceMin(b.min != null ? String(b.min) : "");
                          setPriceMax(b.max != null ? String(b.max) : "");
                        }}
                        className="px-3 py-1.5 text-xs font-medium rounded-full border bg-white hover:bg-orange/5 hover:border-orange text-navy"
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-navy">
                    My child&apos;s age
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    max="25"
                    placeholder="e.g. 9"
                    value={childAge}
                    onChange={(e) => setChildAge(e.target.value)}
                    className="min-h-[44px]"
                  />
                  {ageNum != null && !Number.isNaN(ageNum) && sportFilter !== "all" && (
                    <SizeRecommendation age={ageNum} sport={sportFilter} />
                  )}
                  {ageNum != null && !Number.isNaN(ageNum) && sportFilter === "all" && (
                    <p className="text-xs text-muted-foreground">
                      Pick a sport above to see size recommendations.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-navy">City</Label>
                  <Select
                    value={cityFilter}
                    onValueChange={(v) => setCityFilter(v ?? "all")}
                  >
                    <SelectTrigger className="min-h-[44px]">
                      <SelectValue placeholder="All Cities" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Cities</SelectItem>
                      {DFW_CITIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-3 pt-2 sticky bottom-0 bg-white py-2">
                  <Button
                    variant="outline"
                    className="flex-1 min-h-[44px]"
                    onClick={clearAll}
                  >
                    Clear all
                  </Button>
                  <Button
                    className="flex-1 btn-primary min-h-[44px]"
                    onClick={() => setShowFilters(false)}
                  >
                    Show results
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
