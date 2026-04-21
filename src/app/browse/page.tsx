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
import { SlidersHorizontal, X, ShoppingBag } from "lucide-react";
import type { Listing, User } from "@/types/database";

type ListingWithSeller = Listing & {
  seller?: Pick<User, "full_name" | "avg_rating" | "city">;
};

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

export default function BrowsePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col bg-gray-50">
          <Navbar />
          <main className="page-with-nav flex-1">
            <div className="max-w-7xl mx-auto w-full px-4 py-4">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <ListingCardSkeleton key={i} />
                ))}
              </div>
            </div>
          </main>
          <BottomNav />
        </div>
      }
    >
      <BrowseContent />
    </Suspense>
  );
}

function BrowseContent() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();

  const [listings, setListings] = useState<ListingWithSeller[]>([]);
  const [loading, setLoading] = useState(true);
  const [sportFilter, setSportFilter] = useState(
    searchParams.get("sport") || "all",
  );
  const [conditionFilter, setConditionFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [priceMin, setPriceMin] = useState<string>("");
  const [priceMax, setPriceMax] = useState<string>("");
  const [childAge, setChildAge] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchListings = async () => {
      setLoading(true);
      let query = supabase
        .from("listings")
        .select(
          "*, seller:users!seller_id(full_name, avg_rating, city)",
        )
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(20);

      if (sportFilter !== "all") query = query.eq("sport", sportFilter);
      if (conditionFilter !== "all")
        query = query.eq("condition", conditionFilter);
      if (cityFilter !== "all") query = query.eq("city", cityFilter);

      const minCents = priceMin ? parseFloat(priceMin) * 100 : null;
      const maxCents = priceMax ? parseFloat(priceMax) * 100 : null;
      if (minCents != null && !Number.isNaN(minCents))
        query = query.gte("price", minCents);
      if (maxCents != null && !Number.isNaN(maxCents))
        query = query.lte("price", maxCents);

      const ageNum = childAge ? parseInt(childAge, 10) : null;
      if (ageNum != null && !Number.isNaN(ageNum)) {
        query = query.lte("age_min", ageNum).gte("age_max", ageNum);
      }

      const { data } = await query;
      if (cancelled) return;
      setListings((data as ListingWithSeller[]) || []);
      setLoading(false);
    };

    fetchListings();
    return () => {
      cancelled = true;
    };
  }, [
    supabase,
    sportFilter,
    conditionFilter,
    cityFilter,
    priceMin,
    priceMax,
    childAge,
  ]);

  useEffect(() => {
    const channel = supabase
      .channel("listings-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "listings" },
        (payload) => {
          const row = payload.new as Listing;
          if (row.status !== "active") return;
          if (sportFilter !== "all" && row.sport !== sportFilter) return;
          setListings((prev) => {
            if (prev.some((p) => p.id === row.id)) return prev;
            return [row, ...prev];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, sportFilter]);

  const ageNum = childAge ? parseInt(childAge, 10) : null;

  const activeChips: Array<{ label: string; clear: () => void }> = [];
  if (sportFilter !== "all")
    activeChips.push({
      label: sportFilter,
      clear: () => setSportFilter("all"),
    });
  if (conditionFilter !== "all") {
    activeChips.push({
      label: formatCondition(conditionFilter),
      clear: () => setConditionFilter("all"),
    });
  }
  if (cityFilter !== "all")
    activeChips.push({
      label: cityFilter,
      clear: () => setCityFilter("all"),
    });
  if (priceMin || priceMax)
    activeChips.push({
      label: `$${priceMin || "0"}–$${priceMax || "∞"}`,
      clear: () => {
        setPriceMin("");
        setPriceMax("");
      },
    });
  if (ageNum != null)
    activeChips.push({
      label: `Age ${ageNum}`,
      clear: () => setChildAge(""),
    });

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
        <div className="max-w-7xl mx-auto w-full px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <h1 className="font-heading text-xl font-bold text-navy">
              Browse Gear
            </h1>
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

          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
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
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {listings.map((l) => (
                <ListingCard key={l.id} listing={l} />
              ))}
            </div>
          )}
        </div>
      </main>

      {showFilters && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setShowFilters(false)}
        >
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
                  <Label className="text-sm font-semibold text-navy">
                    Sport
                  </Label>
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
                  <Label className="text-sm font-semibold text-navy">
                    Price
                  </Label>
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
                  <Label className="text-sm font-semibold text-navy">
                    City
                  </Label>
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
