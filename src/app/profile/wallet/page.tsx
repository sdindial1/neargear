"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Navbar } from "@/components/navbar";
import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Wallet,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import toast from "react-hot-toast";

interface TxRow {
  id: string;
  net_amount: number;
  gross_amount: number;
  created_at: string;
  listing?: { title: string } | null;
}

interface ConnectStatus {
  connected: boolean;
  onboardingComplete: boolean;
  payoutsEnabled: boolean;
  accountId: string | null;
}

function WalletInner() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [connect, setConnect] = useState<ConnectStatus | null>(null);
  const [connectLoading, setConnectLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);

  // Transactions / balance
  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("transactions")
        .select(
          "id, net_amount, gross_amount, created_at, listing:listings!listing_id(title)",
        )
        .eq("seller_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);

      setRows((data as unknown as TxRow[]) || []);
      setLoading(false);
    };
    load();
  }, [supabase]);

  // Stripe Connect status (server-synced with Stripe)
  useEffect(() => {
    const loadStatus = async () => {
      try {
        const res = await fetch("/api/stripe/connect/status");
        if (res.ok) {
          setConnect((await res.json()) as ConnectStatus);
        }
      } catch {
        // leave connect null → card shows a generic retry state
      } finally {
        setConnectLoading(false);
      }
    };
    loadStatus();

    // Feedback when returning from / bailing out of the hosted flow.
    const params = new URLSearchParams(window.location.search);
    if (params.get("connect") === "return") {
      toast.success("Welcome back — updating your payout status…");
    } else if (params.get("connect") === "error") {
      toast.error("Couldn't start Stripe setup. Please try again.");
    }
  }, []);

  const balanceCents = useMemo(
    () => rows.reduce((sum, t) => sum + (t.net_amount || 0), 0),
    [rows],
  );

  const startOnboarding = async () => {
    setRedirecting(true);
    try {
      const res = await fetch("/api/stripe/connect", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url as string;
        return;
      }
      toast.error(data.error || "Couldn't start Stripe setup.");
    } catch {
      toast.error("Network error. Please try again.");
    }
    setRedirecting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-orange" />
        </main>
        <BottomNav />
      </div>
    );
  }

  const payoutsReady = connect?.payoutsEnabled === true;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-5 page-with-nav">
        <h1 className="font-heading text-2xl font-bold text-navy mb-4">
          My Wallet
        </h1>

        <div className="bg-navy text-white rounded-2xl p-6 mb-5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs uppercase tracking-wide font-semibold text-white/60">
              Available Balance
            </p>
            {payoutsReady ? (
              <Badge className="bg-green-500/20 text-green-300 border-0">
                Payouts enabled
              </Badge>
            ) : (
              <Badge className="bg-orange/20 text-orange border-0">
                Payout coming soon
              </Badge>
            )}
          </div>
          <p className="font-heading text-4xl font-bold text-white tabular-nums">
            ${(balanceCents / 100).toFixed(2)}
          </p>
          <Button
            disabled
            title="Withdrawals arrive in a later update"
            className="mt-5 w-full bg-white/10 text-white/60 border border-white/20 hover:bg-white/10 disabled:opacity-100 cursor-not-allowed"
          >
            <Wallet className="w-4 h-4" /> Withdraw
          </Button>
          <p className="text-[11px] text-white/50 mt-2 text-center">
            {payoutsReady
              ? "Your account can receive payouts. Withdrawals arrive in a later update."
              : "Connect your bank below to get ready for payouts."}
          </p>
        </div>

        {/* Stripe Connect onboarding */}
        <ConnectCard
          loading={connectLoading}
          status={connect}
          redirecting={redirecting}
          onStart={startOnboarding}
        />

        <div className="flex items-center justify-between mb-2">
          <h2 className="font-heading text-lg font-bold text-navy">
            Recent activity
          </h2>
          <Link
            href="/profile/transactions"
            className="text-sm text-orange font-semibold"
          >
            See all
          </Link>
        </div>

        {rows.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground bg-white rounded-2xl border">
            <p className="text-sm">No transactions yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((t) => (
              <div
                key={t.id}
                className="bg-white rounded-xl border p-3 flex items-center justify-between"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-navy truncate">
                    {t.listing?.title || "Item"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(t.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <p className="font-bold text-orange tabular-nums">
                  +${(t.net_amount / 100).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

function ConnectCard({
  loading,
  status,
  redirecting,
  onStart,
}: {
  loading: boolean;
  status: ConnectStatus | null;
  redirecting: boolean;
  onStart: () => void;
}) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border p-5 mb-5 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Checking payout setup…</span>
      </div>
    );
  }

  // Payouts fully enabled — ready to receive money.
  if (status?.payoutsEnabled) {
    return (
      <div className="bg-white rounded-2xl border p-5 mb-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-navy">Ready to receive payouts</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Your Stripe account is connected and verified. You&apos;re all set
              to get paid when you sell.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Account exists and onboarding submitted, but payouts not yet enabled —
  // Stripe is still verifying (or needs more info).
  if (status?.connected && status.onboardingComplete) {
    return (
      <div className="bg-white rounded-2xl border p-5 mb-5">
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 text-orange mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-navy">Verifying your account</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Stripe is reviewing your details. This is usually quick. You may
              need to add more info if they ask.
            </p>
            <Button
              onClick={onStart}
              disabled={redirecting}
              variant="outline"
              className="mt-3"
            >
              {redirecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : null}
              Review setup
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Account exists but onboarding not finished — resume the flow.
  if (status?.connected) {
    return (
      <div className="bg-white rounded-2xl border p-5 mb-5">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-orange mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-navy">Finish payout setup</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              You started connecting your bank but didn&apos;t finish. Pick up
              where you left off to get paid.
            </p>
            <Button
              onClick={onStart}
              disabled={redirecting}
              className="mt-3 bg-orange text-white hover:bg-orange/90"
            >
              {redirecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : null}
              Continue setup
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Not connected at all — first-time entry point.
  return (
    <div className="bg-white rounded-2xl border p-5 mb-5">
      <div className="flex items-start gap-3">
        <Wallet className="w-5 h-5 text-orange mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-semibold text-navy">Set up payouts</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Connect your bank securely through Stripe so you can get paid when
            your gear sells. Takes a couple of minutes.
          </p>
          <Button
            onClick={onStart}
            disabled={redirecting}
            className="mt-3 bg-orange text-white hover:bg-orange/90"
          >
            {redirecting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Connect with Stripe
          </Button>
        </div>
      </div>
    </div>
  );
}

import { AuthGate } from "@/components/auth-gate";

export default function WalletPage() {
  return (
    <AuthGate reason="Sign in to see your wallet and earnings.">
      <WalletInner />
    </AuthGate>
  );
}
