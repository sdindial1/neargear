"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
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
import { ArrowRight, ArrowLeft, UserPlus, Loader2, SkipForward } from "lucide-react";
import { DFW_CITIES, ROLES, SPORTS } from "@/lib/constants";
import { isValidZipcodeFormat } from "@/lib/zipcodes";

function SignupInner() {
  const [step, setStep] = useState(1);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState("");
  const [city, setCity] = useState("");
  const [zipcode, setZipcode] = useState("");
  const [childName, setChildName] = useState("");
  const [childAge, setChildAge] = useState("");
  const [childSport, setChildSport] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const redirectTo = searchParams.get("redirect") || "/";
  const passwordsMatch = password === confirmPassword;

  const handleSignup = async (skipChild = false) => {
    setError("");
    setLoading(true);

    const fullName = `${firstName.trim()} ${lastName.trim()}`;

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { full_name: fullName, role, city, zipcode },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      await supabase.from("users").insert({
        id: data.user.id,
        email,
        full_name: fullName,
        role,
        city,
        zipcode,
      });

      if (!skipChild && childName && childAge) {
        await supabase.from("children").insert({
          parent_id: data.user.id,
          name: childName.trim(),
          age: parseInt(childAge),
          primary_sport: childSport || null,
        });
      }
    }

    router.push(
      `/auth/login?message=${encodeURIComponent("Check your email to confirm your account")}${redirectTo !== "/" ? `&redirect=${encodeURIComponent(redirectTo)}` : ""}`,
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-navy safe-top safe-bottom">
      {/* Logo */}
      <div className="pt-8 pb-4 text-center">
        <Link href="/" className="inline-block text-3xl font-bold font-heading">
          <span className="text-white">Near</span>
          <span className="text-orange">Gear</span>
        </Link>
      </div>

      {/* Progress */}
      <div className="step-indicator mb-4">
        <div className={`step-dot ${step === 1 ? "active" : step > 1 ? "completed" : ""}`} />
        <div className={`step-dot ${step === 2 ? "active" : step > 2 ? "completed" : ""}`} />
        <div className={`step-dot ${step === 3 ? "active" : ""}`} />
      </div>

      {/* Form */}
      <div className="flex-1 flex items-start justify-center px-4 pt-2 pb-8">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">

          {/* Step 1: Account */}
          {step === 1 && (
            <>
              <h1 className="font-heading text-2xl font-bold text-navy text-center mb-1">
                Create Account
              </h1>
              <p className="text-center text-muted-foreground text-sm mb-6">
                Join the DFW sports gear community
              </p>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      placeholder="First"
                      className="input-large"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      placeholder="Last"
                      className="input-large"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    className="input-large"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="At least 6 characters"
                    className="input-large"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword">Confirm password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Re-type your password"
                    className="input-large"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                  {confirmPassword && !passwordsMatch && (
                    <p className="text-xs text-red-600">
                      Passwords don&apos;t match.
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>I am a...</Label>
                  <Select value={role} onValueChange={(v) => setRole(v ?? "")}>
                    <SelectTrigger className="input-large">
                      <SelectValue placeholder="Select your role" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => setStep(2)}
                  disabled={
                    !firstName ||
                    !lastName ||
                    !email ||
                    !password ||
                    !passwordsMatch ||
                    !role
                  }
                  className="btn-large btn-primary"
                >
                  Continue <ArrowRight className="w-5 h-5" />
                </Button>
              </div>
            </>
          )}

          {/* Step 2: Location */}
          {step === 2 && (
            <>
              <h1 className="font-heading text-2xl font-bold text-navy text-center mb-1">
                Your Location
              </h1>
              <p className="text-center text-muted-foreground text-sm mb-6">
                Find gear near you in DFW
              </p>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>City / Suburb</Label>
                  <Select value={city} onValueChange={(v) => setCity(v ?? "")}>
                    <SelectTrigger className="input-large">
                      <SelectValue placeholder="Select your city" />
                    </SelectTrigger>
                    <SelectContent>
                      {DFW_CITIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="zipcode">Zipcode</Label>
                  <Input
                    id="zipcode"
                    type="text"
                    inputMode="numeric"
                    maxLength={5}
                    placeholder="e.g. 75033"
                    className="input-large tabular-nums"
                    value={zipcode}
                    onChange={(e) =>
                      setZipcode(
                        e.target.value.replace(/\D/g, "").slice(0, 5),
                      )
                    }
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Used to find safe meetup spots near you.
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setStep(1)}
                    className="btn-large flex-1"
                  >
                    <ArrowLeft className="w-5 h-5" /> Back
                  </Button>
                  <Button
                    onClick={() => setStep(3)}
                    disabled={!city || !isValidZipcodeFormat(zipcode)}
                    className="btn-large btn-primary flex-1"
                  >
                    Continue <ArrowRight className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* Step 3: Child Profile */}
          {step === 3 && (
            <>
              <h1 className="font-heading text-2xl font-bold text-navy text-center mb-1">
                Add a Child
              </h1>
              <p className="text-center text-muted-foreground text-sm mb-6">
                AI will find gear that fits. You can skip this.
              </p>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="childName">Child&apos;s Name</Label>
                  <Input
                    id="childName"
                    placeholder="First name"
                    className="input-large"
                    value={childName}
                    onChange={(e) => setChildName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="childAge">Age</Label>
                  <Input
                    id="childAge"
                    type="number"
                    min="3"
                    max="18"
                    placeholder="e.g. 9"
                    className="input-large"
                    value={childAge}
                    onChange={(e) => setChildAge(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Primary Sport</Label>
                  <Select value={childSport} onValueChange={(v) => setChildSport(v ?? "")}>
                    <SelectTrigger className="input-large">
                      <SelectValue placeholder="Select sport (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {SPORTS.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</p>
                )}

                <Button
                  onClick={() => handleSignup(false)}
                  disabled={loading || (!childName && !childAge)}
                  className="btn-large btn-primary"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
                  Create Account
                </Button>

                <div className="flex items-center gap-3">
                  <Button variant="outline" onClick={() => setStep(2)} className="flex-1 min-h-[44px]">
                    <ArrowLeft className="w-4 h-4" /> Back
                  </Button>
                  <button
                    onClick={() => handleSignup(true)}
                    disabled={loading}
                    className="flex-1 text-sm text-muted-foreground hover:text-navy transition-colors flex items-center justify-center gap-1 min-h-[44px]"
                  >
                    Skip for now <SkipForward className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href={`/auth/login${redirectTo !== "/" ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`}
              className="text-orange hover:text-orange-light font-semibold"
            >
              Log in
            </Link>
          </p>

          <Link
            href="/"
            className="mt-3 block text-center text-xs text-muted-foreground"
          >
            Continue as guest — just browsing
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-navy">
          <Loader2 className="w-6 h-6 animate-spin text-orange" />
        </div>
      }
    >
      <SignupInner />
    </Suspense>
  );
}
