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
import { formatPhone, isValidUSPhone, toE164 } from "@/lib/phone";
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
  const [phone, setPhone] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [spouseFirst, setSpouseFirst] = useState("");
  const [spouseLast, setSpouseLast] = useState("");
  const [spousePhone, setSpousePhone] = useState("");
  const [spouseEmail, setSpouseEmail] = useState("");
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
        setPhone(formatPhone(u.phone || ""));
        setFamilyName(u.family_name || "");
        const spouseParts = (u.spouse_name || "").trim().split(/\s+/);
        setSpouseFirst(spouseParts[0] || "");
        setSpouseLast(spouseParts.slice(1).join(" "));
        setSpousePhone(formatPhone(u.spouse_phone || ""));
        setSpouseEmail(u.spouse_email || "");
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
    const safeFamilyName = sanitizeText(familyName, LIMITS.NAME);
    const spouseFullRaw = `${spouseFirst.trim()} ${spouseLast.trim()}`.trim();
    const safeSpouseName = sanitizeText(spouseFullRaw, LIMITS.NAME);
    const safeSpouseEmail = spouseEmail.trim().toLowerCase();

    if (!safeName) {
      setError("Name is required.");
      return;
    }
    if (zipcode && !isValidZipcodeFormat(zipcode)) {
      setError("Zipcode must be 5 digits.");
      return;
    }
    if (phone && !isValidUSPhone(phone)) {
      setError("Phone must be a 10-digit US number.");
      return;
    }
    if (spousePhone && !isValidUSPhone(spousePhone)) {
      setError("Spouse phone must be a 10-digit US number.");
      return;
    }
    if (
      safeSpouseEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeSpouseEmail)
    ) {
      setError("Spouse email looks invalid.");
      return;
    }

    if (!userId) return;
    setSaving(true);

    const e164 = toE164(phone);
    const spouseE164 = toE164(spousePhone);

    const { error: updateError } = await supabase
      .from("users")
      .update({
        full_name: safeName,
        city: safeCity || null,
        zipcode: zipcode || null,
        phone: e164,
        family_name: safeFamilyName || null,
        spouse_name: safeSpouseName || null,
        spouse_phone: spouseE164,
        spouse_email: safeSpouseEmail || null,
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

            <div className="space-y-2">
              <Label htmlFor="phone">
                Mobile number{" "}
                <span className="text-xs text-muted-foreground font-normal">
                  (for meetup reminders)
                </span>
              </Label>
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                className="input-large"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                placeholder="(555) 555-5555"
                maxLength={14}
              />
              <p className="text-xs text-muted-foreground">
                Optional. We&apos;ll text you 2 hours before each meetup. US
                numbers only.
              </p>
            </div>

            <div className="border-t pt-4 mt-2">
              <h2 className="font-heading text-lg font-bold text-navy">
                Household
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5 mb-3">
                Optional. Add a family display name and a spouse who shares
                this account.
              </p>

              <div className="space-y-2">
                <Label htmlFor="familyName">Family name</Label>
                <Input
                  id="familyName"
                  className="input-large"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  maxLength={LIMITS.NAME}
                  placeholder="The Dindial Family"
                />
                <p className="text-xs text-muted-foreground">
                  Shows on your profile instead of your full name.
                </p>
              </div>

              <div className="mt-4">
                <p className="text-sm font-semibold text-navy">
                  Add a spouse or partner
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Your spouse can use this same account. Switch between
                  profiles when messaging.
                </p>

                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="spouseFirst">Spouse first name</Label>
                    <Input
                      id="spouseFirst"
                      className="input-large"
                      value={spouseFirst}
                      onChange={(e) => setSpouseFirst(e.target.value)}
                      maxLength={LIMITS.NAME}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="spouseLast">Spouse last name</Label>
                    <Input
                      id="spouseLast"
                      className="input-large"
                      value={spouseLast}
                      onChange={(e) => setSpouseLast(e.target.value)}
                      maxLength={LIMITS.NAME}
                    />
                  </div>
                </div>

                <div className="space-y-1.5 mt-3">
                  <Label htmlFor="spousePhone">Spouse mobile (optional)</Label>
                  <Input
                    id="spousePhone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    className="input-large"
                    value={spousePhone}
                    onChange={(e) => setSpousePhone(formatPhone(e.target.value))}
                    placeholder="(555) 555-5555"
                    maxLength={14}
                  />
                </div>

                <div className="space-y-1.5 mt-3">
                  <Label htmlFor="spouseEmail">Spouse email (optional)</Label>
                  <Input
                    id="spouseEmail"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    className="input-large"
                    value={spouseEmail}
                    onChange={(e) => setSpouseEmail(e.target.value)}
                    placeholder="spouse@example.com"
                  />
                </div>
              </div>
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
