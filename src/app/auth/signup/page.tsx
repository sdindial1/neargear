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
import { ArrowLeft, ArrowRight, Loader2, UserPlus } from "lucide-react";
import { DFW_CITIES } from "@/lib/constants";
import { isValidZipcodeFormat } from "@/lib/zipcodes";
import { formatPhone, isValidUSPhone, toE164 } from "@/lib/phone";

function SignupInner() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [city, setCity] = useState("");
  const [zipcode, setZipcode] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const redirectTo = searchParams.get("redirect") || "/";
  const passwordsMatch = password === confirmPassword;

  const handleSignup = async () => {
    setError("");

    if (phone && !isValidUSPhone(phone)) {
      setError("Phone must be a 10-digit US number, or leave blank.");
      return;
    }

    setLoading(true);

    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    const phoneE164 = toE164(phone);

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { full_name: fullName, city, zipcode, phone: phoneE164 },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (signUpData.user) {
      await supabase.from("users").insert({
        id: signUpData.user.id,
        email,
        full_name: fullName,
        city,
        zipcode,
        phone: phoneE164,
      });
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      router.push(
        `/auth/login${redirectTo !== "/" ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`,
      );
      return;
    }

    await supabase.auth.getSession();
    router.push(redirectTo);
    router.refresh();
  };

  return (
    <div className="min-h-screen flex flex-col bg-navy safe-top safe-bottom">
      <div className="pt-8 pb-4 text-center">
        <Link
          href="/"
          className="inline-block text-3xl font-bold font-heading"
        >
          <span className="text-white">Near</span>
          <span className="text-orange">Gear</span>
        </Link>
      </div>

      <div className="step-indicator mb-4">
        <div
          className={`step-dot ${step === 1 ? "active" : step > 1 ? "completed" : ""}`}
        />
        <div className={`step-dot ${step === 2 ? "active" : ""}`} />
      </div>

      <div className="flex-1 flex items-start justify-center px-4 pt-2 pb-8">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
          {step === 1 && (
            <>
              <h1 className="font-heading text-2xl font-bold text-navy text-center mb-1">
                Create Account
              </h1>
              <p className="text-center text-muted-foreground text-sm mb-6">
                Join the DFW sports gear community
              </p>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
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
                <Button
                  onClick={() => setStep(2)}
                  disabled={
                    !email || !password || password.length < 6 || !passwordsMatch
                  }
                  className="btn-large btn-primary"
                >
                  Continue <ArrowRight className="w-5 h-5" />
                </Button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="font-heading text-2xl font-bold text-navy text-center mb-1">
                Almost done
              </h1>
              <p className="text-center text-muted-foreground text-sm mb-6">
                A few details to find gear near you
              </p>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      autoComplete="given-name"
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
                      autoComplete="family-name"
                      placeholder="Last"
                      className="input-large"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>City / Suburb</Label>
                  <Select value={city} onValueChange={(v) => setCity(v ?? "")}>
                    <SelectTrigger className="input-large">
                      <SelectValue placeholder="Select your city" />
                    </SelectTrigger>
                    <SelectContent>
                      {DFW_CITIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
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
                    autoComplete="postal-code"
                    maxLength={5}
                    placeholder="e.g. 75033"
                    className="input-large tabular-nums"
                    value={zipcode}
                    onChange={(e) =>
                      setZipcode(e.target.value.replace(/\D/g, "").slice(0, 5))
                    }
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Used to find safe meetup spots near you.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="phone">Mobile number</Label>
                  <p className="text-xs text-muted-foreground -mt-1">
                    For meetup reminders via text. Optional.
                  </p>
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder="(555) 555-5555"
                    className="input-large"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    maxLength={14}
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">
                    {error}
                  </p>
                )}

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setStep(1)}
                    disabled={loading}
                    className="btn-large flex-1"
                  >
                    <ArrowLeft className="w-5 h-5" /> Back
                  </Button>
                  <Button
                    onClick={handleSignup}
                    disabled={
                      loading ||
                      !firstName ||
                      !lastName ||
                      !city ||
                      !isValidZipcodeFormat(zipcode)
                    }
                    className="btn-large btn-primary flex-1"
                  >
                    {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <UserPlus className="w-5 h-5" />
                    )}
                    Create Account
                  </Button>
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
