"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { Navbar } from "@/components/navbar";
import { BottomNav } from "@/components/bottom-nav";
import { AuthGate } from "@/components/auth-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft, Loader2, Save } from "lucide-react";
import { getZipcodeCity, isValidZipcodeFormat } from "@/lib/zipcodes";
import { sanitizeText, LIMITS } from "@/lib/sanitize";
import type { User } from "@/types/database";

function ProfileEditInner() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fullName, setFullName] = useState("");
  const [city, setCity] = useState("");
  const [zipcode, setZipcode] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;
      const { data: profile } = await supabase
        .from("users")
        .select("*")
        .eq("id", authUser.id)
        .single();
      if (profile) {
        const u = profile as User;
        setUserId(u.id);
        setFullName(u.full_name || "");
        setCity(u.city || "");
        setZipcode(u.zipcode || "");
      }
      setLoading(false);
    }
    load();
  }, []);

  // Auto-fill city when valid zipcode entered
  useEffect(() => {
    if (isValidZipcodeFormat(zipcode)) {
      const matched = getZipcodeCity(zipcode);
      if (matched) setCity(matched);
    }
  }, [zipcode]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const safeName = sanitizeText(fullName, LIMITS.NAME);
    const safeCity = sanitizeText(city, LIMITS.NAME);

    if (!safeName) {
      setError("Name is required.");
      return;
    }
    if (zipcode && !isValidZipcodeFormat(zipcode)) {
      setError("Zipcode must be 5 digits.");
      return;
    }

    if (!userId) return;
    setSaving(true);

    const { error: updateError } = await supabase
      .from("users")
      .update({
        full_name: safeName,
        city: safeCity || null,
        zipcode: zipcode || null,
      })
      .eq("id", userId);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    toast.success("Profile updated");
    router.push("/profile");
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

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="page-with-nav flex-1">
        <div className="max-w-md mx-auto w-full px-4 py-6">
          <Link
            href="/profile"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4"
          >
            <ChevronLeft className="w-4 h-4" /> Back to profile
          </Link>

          <h1 className="font-heading text-2xl font-bold text-navy mb-6">
            Edit Profile
          </h1>

          <form onSubmit={handleSave} className="space-y-4 bg-white rounded-2xl p-5 shadow-sm">
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                className="input-large"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                maxLength={LIMITS.NAME}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="zipcode">Zipcode</Label>
              <Input
                id="zipcode"
                className="input-large"
                inputMode="numeric"
                pattern="[0-9]{5}"
                maxLength={5}
                value={zipcode}
                onChange={(e) =>
                  setZipcode(e.target.value.replace(/\D/g, "").slice(0, 5))
                }
                placeholder="75034"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                className="input-large"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                maxLength={LIMITS.NAME}
                placeholder="Frisco"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="btn-large btn-primary"
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Save className="w-5 h-5" />
              )}
              Save Changes
            </Button>
          </form>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}

export default function ProfileEditPage() {
  return (
    <AuthGate reason="Sign in to edit your profile.">
      <ProfileEditInner />
    </AuthGate>
  );
}
