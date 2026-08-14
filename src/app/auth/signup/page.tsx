"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import confetti from "canvas-confetti";
import { createClient } from "@/lib/supabase/client";
import { AceCharacter } from "@/components/ace/ace-character";
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
import { ArrowLeft, ArrowRight, Loader2, Star, UserPlus } from "lucide-react";
import { DFW_CITIES } from "@/lib/constants";
import { isValidZipcodeFormat } from "@/lib/zipcodes";
import { formatPhone, isValidUSPhone, toE164 } from "@/lib/phone";
import { safeRedirect } from "@/lib/safe-redirect";
import { trackStandard } from "@/lib/meta-pixel";

type FoundingPhase =
  | "off"
  | "claiming"
  | "celebrating"
  | "spots_full"
  | "waitlist_joined";

// Effective date of the current Terms / Privacy Policy. Bumping this
// invalidates older acceptances if we ever add a re-acceptance flow.
//
// 2026-08-05: Terms section 6 was rewritten from the retired deposit model to
// the full-payment model actually in use — held funds, the 10% buyer and seller
// fees, binary dispute resolution, and the fact that a released payout cannot
// be reversed automatically. Signups from here record acceptance of THAT, not
// the deposit-era text.
//
// Note there is still no re-acceptance flow, so users who signed up before this
// date carry the old version string and have never seen the new terms.
const TERMS_VERSION = "2026-08-05";

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
  const [foundingPhase, setFoundingPhase] = useState<FoundingPhase>("off");
  const [waitlistJoining, setWaitlistJoining] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  // Default to /marketplace (see login/page.tsx for the same reasoning).
  // safeRedirect rejects anything that isn't a same-origin path — without it
  // this value reaches router.push() and an absolute URL navigates off-site.
  const redirectTo = safeRedirect(searchParams.get("redirect"), "/marketplace");
  const isFoundingFlow = searchParams.get("founding") === "true";
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

      // Record terms acceptance as an audit trail. Separate update so an
      // older schema without the new columns still lets signup succeed —
      // the migration in supabase/migrations/011_terms_acceptance.sql adds
      // them. Errors here are logged but don't block account creation.
      try {
        const { error: termsErr } = await supabase
          .from("users")
          .update({
            terms_accepted_at: new Date().toISOString(),
            terms_version: TERMS_VERSION,
          })
          .eq("id", signUpData.user.id);
        if (termsErr) {
          console.warn("[signup] terms acceptance not recorded:", termsErr.message);
        }
      } catch (err) {
        console.warn("[signup] terms acceptance write threw:", err);
      }

      // Fires only inside `if (signUpData.user)`, so a rejected signup never
      // reports a conversion. Placed before the founding-flow branch below,
      // which returns early — instrumenting after it would silently miss every
      // founding signup. Sends no data: see lib/meta-pixel.ts.
      trackStandard("CompleteRegistration");
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

    if (isFoundingFlow) {
      setFoundingPhase("claiming");
      try {
        const res = await fetch("/api/founding/claim", { method: "POST" });
        const body = await res.json().catch(() => ({}));
        if (res.ok || body.error === "already_founding") {
          setFoundingPhase("celebrating");
          return;
        }
        if (body.error === "spots_full") {
          setFoundingPhase("spots_full");
          return;
        }
        // Some other error — fall through to home.
        console.error("[founding/claim] unexpected:", body);
      } catch (err) {
        console.error("[founding/claim] threw", err);
      }
    }

    // Brand-new accounts get the first-run experience, which then forwards to
    // wherever they were headed. /welcome decides eligibility server-side and
    // redirects straight through for anyone who isn't actually new, so this is
    // safe to send everyone to.
    router.push(`/welcome?next=${encodeURIComponent(redirectTo)}`);
    router.refresh();
  };

  // Confetti while celebrating; auto-redirect home after a moment.
  useEffect(() => {
    if (foundingPhase !== "celebrating") return;
    const colors = ["#ff6b35", "#0d2438", "#ffffff", "#ffa078"];
    const end = Date.now() + 2500;
    const fire = () => {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors,
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors,
      });
      if (Date.now() < end) requestAnimationFrame(fire);
    };
    fire();
  }, [foundingPhase]);

  const handleWaitlistFromSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setWaitlistJoining(true);
    await fetch("/api/founding/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setWaitlistJoining(false);
    setFoundingPhase("waitlist_joined");
  };

  // Exit from the founding-member celebration. Same first-run routing as the
  // standard path — a founding signup is still someone's first minute here.
  const goHome = () => {
    router.push(`/welcome?next=${encodeURIComponent(redirectTo)}`);
    router.refresh();
  };

  if (foundingPhase === "celebrating") {
    return (
      <div className="fixed inset-0 z-[100] bg-navy flex flex-col items-center justify-center px-6 text-center safe-top safe-bottom">
        <div className="mb-4">
          <AceCharacter state="excited" size="lg" />
        </div>
        <h1 className="font-heading text-3xl md:text-4xl font-bold text-white mb-2">
          Welcome to the Founding Family!{" "}
          <Star className="inline w-7 h-7 text-orange fill-orange -mt-1" />
        </h1>
        <p className="text-white/80 max-w-sm mt-1 mb-8 leading-relaxed">
          You&apos;re one of only 15 DFW families with{" "}
          <strong className="text-orange">zero fees forever</strong>.
        </p>
        <Button onClick={goHome} className="btn-large btn-primary w-full max-w-xs">
          Let&apos;s go!
        </Button>
      </div>
    );
  }

  if (foundingPhase === "spots_full" || foundingPhase === "waitlist_joined") {
    return (
      <div className="fixed inset-0 z-[100] bg-navy flex flex-col items-center justify-center px-6 text-center safe-top safe-bottom">
        <h1 className="font-heading text-2xl md:text-3xl font-bold text-white mb-2">
          {foundingPhase === "waitlist_joined"
            ? "You're on the waitlist."
            : "All spots were just claimed."}
        </h1>
        {foundingPhase === "spots_full" ? (
          <>
            <p className="text-white/70 max-w-sm mb-6 leading-relaxed">
              Your account is created. Drop your email below and we&apos;ll
              keep you in mind if a founding spot opens up.
            </p>
            <form
              onSubmit={handleWaitlistFromSignup}
              className="w-full max-w-xs space-y-2"
            >
              <Input
                type="email"
                value={email}
                readOnly
                className="input-large bg-white text-navy"
              />
              <Button
                type="submit"
                disabled={waitlistJoining}
                className="btn-large btn-primary w-full"
              >
                {waitlistJoining ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "Join the Waitlist"
                )}
              </Button>
              <Button
                type="button"
                variant="outlineOnDark"
                onClick={goHome}
                className="btn-large w-full"
              >
                No thanks, take me home
              </Button>
            </form>
          </>
        ) : (
          <>
            <p className="text-white/70 max-w-sm mb-6 leading-relaxed">
              We&apos;ll reach out if a founding spot opens up.
            </p>
            <Button
              onClick={goHome}
              className="btn-large btn-primary w-full max-w-xs"
            >
              Open NearGear
            </Button>
          </>
        )}
      </div>
    );
  }

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
        {isFoundingFlow && (
          <p className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange/20 text-orange text-xs font-semibold">
            <Star className="w-3.5 h-3.5 fill-orange" />
            Claiming your Founding Family spot
          </p>
        )}
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

                <div className="flex items-start gap-3 pt-2">
                  <input
                    type="checkbox"
                    id="terms-agreement"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="mt-1 w-5 h-5 rounded border-gray-400 text-orange focus:ring-orange focus:ring-2 cursor-pointer"
                    required
                  />
                  <label
                    htmlFor="terms-agreement"
                    className="text-sm text-muted-foreground leading-relaxed cursor-pointer"
                  >
                    I am at least 18 years old and I agree to NearGear&apos;s{" "}
                    <Link
                      href="/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-orange hover:text-orange-light font-semibold underline underline-offset-2"
                    >
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link
                      href="/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-orange hover:text-orange-light font-semibold underline underline-offset-2"
                    >
                      Privacy Policy
                    </Link>
                    .
                  </label>
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
                      !isValidZipcodeFormat(zipcode) ||
                      !agreedToTerms
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
