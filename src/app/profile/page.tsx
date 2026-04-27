"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Navbar } from "@/components/navbar";
import { BottomNav } from "@/components/bottom-nav";
import { ListingCard } from "@/components/listing-card";
import { ListingCardSkeleton } from "@/components/listing-card-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Star,
  MapPin,
  Calendar,
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  LogOut,
  UserCircle,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SPORTS } from "@/lib/constants";
import type { User, Child, Listing } from "@/types/database";

function ProfilePageInner() {
  const supabase = createClient();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [children, setChildren] = useState<Child[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddChild, setShowAddChild] = useState(false);
  const [childName, setChildName] = useState("");
  const [childAge, setChildAge] = useState("");
  const [childSport, setChildSport] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const [
        { data: profile },
        { data: childData },
        { data: listingData },
      ] = await Promise.all([
        supabase.from("users").select("*").eq("id", authUser.id).single(),
        supabase.from("children").select("*").eq("parent_id", authUser.id).order("created_at"),
        supabase.from("listings").select("*").eq("seller_id", authUser.id).order("created_at", { ascending: false }),
      ]);

      setUser(profile as User | null);
      setChildren((childData as Child[]) || []);
      setListings((listingData as Listing[]) || []);
      setLoading(false);
    }
    load();
  }, []);

  const addChild = async () => {
    if (!user || !childName || !childAge) return;
    setSaving(true);

    const { data, error } = await supabase
      .from("children")
      .insert({
        parent_id: user.id,
        name: childName.trim(),
        age: parseInt(childAge),
        primary_sport: childSport || null,
      })
      .select()
      .single();

    if (!error && data) {
      setChildren((prev) => [...prev, data as Child]);
      setChildName("");
      setChildAge("");
      setChildSport("");
      setShowAddChild(false);
    }
    setSaving(false);
  };

  const removeChild = async (childId: string) => {
    await supabase.from("children").delete().eq("id", childId);
    setChildren((prev) => prev.filter((c) => c.id !== childId));
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Navbar />
        <main className="page-with-nav flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-orange" />
        </main>
        <BottomNav />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Navbar />
        <main className="page-with-nav flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <UserCircle className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <h1 className="font-heading text-2xl font-bold text-navy mb-2">Sign in to view profile</h1>
            <a href="/auth/login">
              <Button className="btn-large btn-primary max-w-xs mx-auto mt-4">Sign In</Button>
            </a>
          </div>
        </main>
        <BottomNav />
      </div>
    );
  }

  const memberSince = new Date(user.created_at).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const activeListings = listings.filter((l) => l.status === "active");
  const soldListings = listings.filter((l) => l.status === "sold");

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />

      <main className="page-with-nav flex-1">
        <div className="max-w-2xl mx-auto w-full px-4 py-6">
          {/* Profile header */}
          <div className="text-center mb-6">
            <div className="w-20 h-20 rounded-full bg-orange mx-auto flex items-center justify-center text-white text-3xl font-bold mb-3">
              {user.full_name?.charAt(0) || user.email.charAt(0).toUpperCase()}
            </div>
            <h1 className="font-heading text-2xl font-bold text-navy">
              {user.full_name || "User"}
            </h1>
            <div className="flex items-center justify-center gap-2 mt-1 flex-wrap">
              {user.role && (
                <Badge className="bg-navy/10 text-navy capitalize">{user.role}</Badge>
              )}
              {user.city && (
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5" /> {user.city}
                </span>
              )}
            </div>
            <div className="flex items-center justify-center gap-1 mt-2 text-sm">
              <Star className="w-4 h-4 fill-orange text-orange" />
              <span className="font-semibold">{user.avg_rating?.toFixed(1) || "New"}</span>
              <span className="text-muted-foreground">({user.review_count || 0} reviews)</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
              <Calendar className="w-3 h-3" /> Member since {memberSince}
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-white rounded-xl p-3 text-center shadow-sm">
              <p className="text-2xl font-bold text-navy">{activeListings.length}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
            <div className="bg-white rounded-xl p-3 text-center shadow-sm">
              <p className="text-2xl font-bold text-navy">{soldListings.length}</p>
              <p className="text-xs text-muted-foreground">Sold</p>
            </div>
            <div className="bg-white rounded-xl p-3 text-center shadow-sm">
              <p className="text-2xl font-bold text-navy">0</p>
              <p className="text-xs text-muted-foreground">Bought</p>
            </div>
          </div>

          <Separator className="mb-6" />

          {/* Children */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-heading text-lg font-bold text-navy">Children</h2>
              <button
                onClick={() => setShowAddChild(!showAddChild)}
                className="text-sm text-orange font-semibold flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>

            {showAddChild && (
              <div className="bg-white rounded-xl p-4 shadow-sm mb-3 space-y-3">
                <Input
                  placeholder="Child's name"
                  className="min-h-[44px]"
                  value={childName}
                  onChange={(e) => setChildName(e.target.value)}
                />
                <Input
                  type="number"
                  min="3"
                  max="18"
                  placeholder="Age"
                  className="min-h-[44px]"
                  value={childAge}
                  onChange={(e) => setChildAge(e.target.value)}
                />
                <Select value={childSport} onValueChange={(v) => setChildSport(v ?? "")}>
                  <SelectTrigger className="min-h-[44px]">
                    <SelectValue placeholder="Primary sport (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {SPORTS.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 min-h-[44px]"
                    onClick={() => setShowAddChild(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 min-h-[44px] bg-orange hover:bg-orange-light text-white"
                    disabled={!childName || !childAge || saving}
                    onClick={addChild}
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                  </Button>
                </div>
              </div>
            )}

            {children.length === 0 && !showAddChild && (
              <p className="text-sm text-muted-foreground bg-white rounded-xl p-4 shadow-sm">
                Add your children so AI can find gear that fits.
              </p>
            )}

            {children.map((child) => (
              <div
                key={child.id}
                className="bg-white rounded-xl p-4 shadow-sm mb-2 flex items-center justify-between"
              >
                <div>
                  <p className="font-semibold text-navy">{child.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Age {child.age}
                    {child.primary_sport && ` · ${child.primary_sport}`}
                  </p>
                </div>
                <button
                  onClick={() => removeChild(child.id)}
                  className="p-2 text-muted-foreground hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <Separator className="mb-6" />

          {/* Active Listings */}
          <div>
            <h2 className="font-heading text-lg font-bold text-navy mb-3">
              Your Listings
            </h2>
            {activeListings.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No active listings</p>
                <a href="/sell">
                  <Button className="mt-3 bg-orange hover:bg-orange-light text-white min-h-[44px]">
                    <Plus className="w-4 h-4 mr-1" /> Create Listing
                  </Button>
                </a>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {activeListings.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
              </div>
            )}
          </div>

          <Separator className="my-8" />

          <div className="pb-4">
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="w-full min-h-[52px] rounded-xl border-2 border-orange text-orange font-heading font-semibold text-base flex items-center justify-center gap-2 bg-white hover:bg-orange/5 active:bg-orange/10 transition-colors cursor-pointer disabled:opacity-60"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              {signingOut ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <LogOut className="w-5 h-5" />
              )}
              Sign Out
            </button>
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}

import { AuthGate } from "@/components/auth-gate";

export default function ProfilePage() {
  return (
    <AuthGate reason="Sign in to see your listings, kids, and stats.">
      <ProfilePageInner />
    </AuthGate>
  );
}
