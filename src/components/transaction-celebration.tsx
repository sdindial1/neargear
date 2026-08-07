"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import confetti from "canvas-confetti";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

interface Props {
  role: "buyer" | "seller";
  /** Item price. Fallback only — see buyerPaidDollars. */
  itemDollars: number;
  /**
   * What the buyer was actually charged (item price plus the buyer fee), from
   * the order row. The savings claim is measured against THIS, not the item
   * price: the buyer paid $11.22 for a $10.20 item, so comparing retail to
   * $10.20 credits them $1.02 of savings they did not get. The Terms describe
   * the fee plainly, and this number should not contradict them.
   */
  buyerPaidDollars: number | null;
  /**
   * What the seller actually receives: item price minus the seller fee, read
   * from the order row. This screen used to show the seller the item price
   * instead, which overstated the payout by the 10% seller fee — a real number
   * on a celebration screen, wrong. It is not derived here because the fee is
   * 0 for founding sellers, so any client-side percentage would be wrong for
   * exactly the sellers we most want to keep happy.
   */
  sellerPayoutDollars: number | null;
  retailDollars: number | null;
  meetupId: string;
}

export function TransactionCelebration({
  role,
  itemDollars,
  buyerPaidDollars,
  sellerPayoutDollars,
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

  // Falls back to the item price only if the order row had no captured total.
  // That path understates the buyer's cost, so it can overstate savings — it
  // exists so the screen still renders, not because it is equally correct.
  const buyerCost = buyerPaidDollars ?? itemDollars;
  const savings =
    retailDollars && retailDollars > buyerCost
      ? Math.round(retailDollars - buyerCost)
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
            Payment Released!
          </h1>
          {sellerPayoutDollars != null ? (
            <>
              <p className="font-heading text-5xl md:text-6xl font-bold text-orange tabular-nums mb-2">
                ${sellerPayoutDollars.toFixed(2)}
              </p>
              <p className="text-base text-white/70 mb-10">
                On its way to your account.
              </p>
            </>
          ) : (
            <p className="text-base text-white/70 mb-10">
              Your payout is on its way to your account.
            </p>
          )}
          <div className="space-y-2 w-full max-w-xs">
            <Link href="/profile/wallet">
              <Button className="btn-large btn-primary">View Wallet</Button>
            </Link>
            <Link href="/">
              <Button variant="outlineOnDark" className="btn-large w-full">
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
              <Button variant="outlineOnDark" className="btn-large w-full">
                Back to Home
              </Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
