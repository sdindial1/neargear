"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import confetti from "canvas-confetti";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

interface Props {
  role: "buyer" | "seller";
  grossDollars: number;
  retailDollars: number | null;
  meetupId: string;
}

export function TransactionCelebration({
  role,
  grossDollars,
  retailDollars,
  meetupId,
}: Props) {
  const router = useRouter();

  useEffect(() => {
    const colors = ["#ff6b35", "#0d2438", "#ffffff", "#ffa078"];
    const end = Date.now() + 2200;

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
      if (Date.now() < end) {
        requestAnimationFrame(fire);
      }
    };

    fire();

    const timeout = setTimeout(() => {
      router.push("/");
    }, 8000);

    return () => clearTimeout(timeout);
  }, [router]);

  const savings =
    retailDollars && retailDollars > grossDollars
      ? Math.round(retailDollars - grossDollars)
      : 0;

  return (
    <div className="fixed inset-0 z-[100] bg-navy flex flex-col items-center justify-center px-6 text-center">
      <div className="success-pop w-24 h-24 rounded-full bg-green-100 flex items-center justify-center mb-6">
        <CheckCircle2
          className="w-14 h-14 text-green-600"
          strokeWidth={2}
        />
      </div>

      {role === "seller" ? (
        <>
          <h1 className="font-heading text-3xl md:text-4xl font-bold text-white mb-3">
            Payment Received!
          </h1>
          <p className="font-heading text-5xl md:text-6xl font-bold text-orange tabular-nums mb-10">
            ${grossDollars.toFixed(2)}
          </p>
          <div className="space-y-2 w-full max-w-xs">
            <Link href="/profile/wallet">
              <Button className="btn-large btn-primary">View Wallet</Button>
            </Link>
            <Link href="/">
              <Button
                variant="outline"
                className="btn-large w-full text-white border-white/30 hover:bg-white/10"
              >
                Back to Home
              </Button>
            </Link>
          </div>
        </>
      ) : (
        <>
          <h1 className="font-heading text-3xl md:text-4xl font-bold text-white mb-3">
            Deal Complete!
          </h1>
          {savings > 0 ? (
            <p className="font-heading text-2xl text-orange font-semibold mb-10">
              You saved ${savings} vs buying new!
            </p>
          ) : (
            <p className="text-base text-white/70 mb-10">
              Thanks for buying local.
            </p>
          )}
          <div className="space-y-2 w-full max-w-xs">
            <Link href={`/reviews/${meetupId}`}>
              <Button className="btn-large btn-primary">
                Leave a Review
              </Button>
            </Link>
            <Link href="/">
              <Button
                variant="outline"
                className="btn-large w-full text-white border-white/30 hover:bg-white/10"
              >
                Back to Home
              </Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
