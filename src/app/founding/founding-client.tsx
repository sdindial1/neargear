"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { AceCharacter } from "@/components/ace/ace-character";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Loader2, Sparkles, Star } from "lucide-react";

interface Props {
  initialSpotsClaimed: number;
  initialTotalSpots: number;
  isSignedIn: boolean;
  isFoundingMember: boolean;
}

const COUNTER_REFRESH_MS = 30_000;

export function FoundingClient({
  initialSpotsClaimed,
  initialTotalSpots,
  isSignedIn,
  isFoundingMember: isFoundingMemberInitial,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [spotsClaimed, setSpotsClaimed] = useState(initialSpotsClaimed);
  const [totalSpots, setTotalSpots] = useState(initialTotalSpots);
  const [isFoundingMember, setIsFoundingMember] = useState(
    isFoundingMemberInitial,
  );
  const [claiming, setClaiming] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [joiningWaitlist, setJoiningWaitlist] = useState(false);
  const [waitlistJoined, setWaitlistJoined] = useState(false);

  const remaining = Math.max(0, totalSpots - spotsClaimed);
  const fullyClaimed = remaining === 0;
  const progressPct = totalSpots > 0
    ? Math.min(100, (spotsClaimed / totalSpots) * 100)
    : 0;

  // Color the counter based on scarcity.
  const remainingColorClass =
    remaining <= 2
      ? "text-red-400"
      : remaining <= 5
        ? "text-orange"
        : "text-white";
  const progressColorClass =
    remaining <= 2
      ? "bg-red-500"
      : remaining <= 5
        ? "bg-orange"
        : "bg-orange";

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const { data } = await supabase
        .from("founding_spots")
        .select("spots_claimed, total_spots")
        .eq("id", 1)
        .maybeSingle();
      if (!alive || !data) return;
      setSpotsClaimed(data.spots_claimed);
      setTotalSpots(data.total_spots);
    };
    const id = setInterval(refresh, COUNTER_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [supabase]);

  const handleClaim = async () => {
    setClaiming(true);
    const res = await fetch("/api/founding/claim", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setClaiming(false);

    if (res.ok) {
      setIsFoundingMember(true);
      if (typeof body.spotsClaimed === "number") {
        setSpotsClaimed(body.spotsClaimed);
      }
      toast.success("Welcome to the Founding Family! ⭐");
      return;
    }

    if (body.error === "already_founding") {
      setIsFoundingMember(true);
      return;
    }
    if (body.error === "spots_full") {
      toast.error("All founding spots were just claimed.");
      // Refresh counter so the UI reflects the truth.
      const { data } = await supabase
        .from("founding_spots")
        .select("spots_claimed, total_spots")
        .eq("id", 1)
        .maybeSingle();
      if (data) {
        setSpotsClaimed(data.spots_claimed);
        setTotalSpots(data.total_spots);
      }
      return;
    }
    toast.error(body.message || body.error || "Could not claim your spot.");
  };

  const handleWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = waitlistEmail.trim();
    if (!email) return;
    setJoiningWaitlist(true);
    const res = await fetch("/api/founding/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setJoiningWaitlist(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error || "Could not join waitlist.");
      return;
    }
    setWaitlistJoined(true);
    toast.success("You're on the list. We'll be in touch.");
  };

  return (
    <main className="px-4 pb-8">
      <section className="text-center pt-6 pb-8">
        <div className="relative inline-block">
          <div
            className="absolute inset-0 rounded-full bg-orange/30 blur-3xl scale-150"
            aria-hidden
          />
          <div className="relative">
            <AceCharacter state="idle" size="lg" />
          </div>
        </div>
        <h1 className="font-heading text-4xl md:text-5xl font-bold text-white mt-4">
          Founding Family
        </h1>
        <p className="text-white/80 max-w-md mx-auto mt-3 text-base leading-relaxed px-2">
          You&apos;ve been invited to join NearGear as one of our first{" "}
          <strong className="text-orange">15 DFW families</strong>. Zero
          platform fees. Forever.
        </p>
      </section>

      <section className="bg-white/5 border border-white/10 rounded-2xl p-5 max-w-md mx-auto mb-8">
        <p className="text-center text-xs uppercase tracking-wide text-white/60 font-semibold">
          Spots remaining
        </p>
        <p
          className={`text-center font-heading font-bold tabular-nums mt-1 ${remainingColorClass}`}
        >
          <span className="text-5xl">{remaining}</span>
          <span className="text-2xl text-white/50"> / {totalSpots}</span>
        </p>
        <div className="mt-4 h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className={`h-full ${progressColorClass} transition-all duration-500`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-center text-[11px] text-white/40 mt-2">
          {spotsClaimed} of {totalSpots} claimed · live counter
        </p>
      </section>

      <section className="grid gap-3 max-w-md mx-auto mb-10">
        <BenefitCard
          icon="🏆"
          title="Zero Fees Forever"
          body="Every sale you make on NearGear — today and always — keeps 100% of the sale price. No platform fees. Ever."
        />
        <BenefitCard
          icon="⭐"
          title="Founding Family Badge"
          body="Your profile carries the exclusive Founding Family badge. A permanent mark of being one of NearGear's first families in DFW."
        />
        <BenefitCard
          icon="🤝"
          title="Shape NearGear"
          body="As a founding family you get direct access to share feedback that shapes how NearGear grows. Your voice matters."
        />
      </section>

      <section className="max-w-md mx-auto">
        {isFoundingMember ? (
          <div className="bg-green-500/10 border border-green-400/30 rounded-2xl p-6 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-500/20 mb-3">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="font-heading text-xl font-bold text-white">
              <Star className="inline w-5 h-5 text-orange fill-orange -mt-1 mr-1" />
              You&apos;re a Founding Family!
            </h2>
            <p className="text-white/80 mt-2 text-sm">
              Welcome to NearGear&apos;s founding circle.
            </p>
            <Link href="/" className="block mt-5">
              <Button className="btn-large btn-primary">
                <Sparkles className="w-5 h-5" /> Open NearGear
              </Button>
            </Link>
          </div>
        ) : fullyClaimed ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center">
            <h2 className="font-heading text-xl font-bold text-white">
              All 15 founding spots have been claimed.
            </h2>
            {waitlistJoined ? (
              <p className="text-white/80 mt-3 text-sm">
                You&apos;re on the waitlist. We&apos;ll reach out if a spot
                opens up.
              </p>
            ) : (
              <>
                <p className="text-white/70 mt-2 text-sm">
                  Drop your email and we&apos;ll keep you in mind.
                </p>
                <form
                  onSubmit={handleWaitlist}
                  className="mt-4 flex flex-col gap-2"
                >
                  <Input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    required
                    placeholder="you@example.com"
                    value={waitlistEmail}
                    onChange={(e) => setWaitlistEmail(e.target.value)}
                    className="input-large bg-white text-navy"
                  />
                  <Button
                    type="submit"
                    disabled={joiningWaitlist || !waitlistEmail}
                    className="btn-large btn-primary"
                  >
                    {joiningWaitlist ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      "Join the Waitlist"
                    )}
                  </Button>
                </form>
              </>
            )}
          </div>
        ) : isSignedIn ? (
          <Button
            onClick={handleClaim}
            disabled={claiming}
            className="btn-large btn-primary w-full"
          >
            {claiming ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Star className="w-5 h-5 fill-white" />
                Become a Founding Family
              </>
            )}
          </Button>
        ) : (
          <>
            <Link href="/auth/signup?founding=true" className="block">
              <Button className="btn-large btn-primary w-full">
                <Star className="w-5 h-5 fill-white" />
                Claim Your Spot
              </Button>
            </Link>
            <p className="text-center text-xs text-white/50 mt-2">
              Takes 2 minutes. Free forever.
            </p>
          </>
        )}
      </section>
    </main>
  );
}

function BenefitCard({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
      <p className="text-2xl">{icon}</p>
      <h3 className="font-heading text-lg font-bold text-white mt-1">
        {title}
      </h3>
      <p className="text-sm text-white/70 mt-1 leading-relaxed">{body}</p>
    </div>
  );
}
