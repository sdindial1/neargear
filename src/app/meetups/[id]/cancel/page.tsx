"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Loader2,
  X,
} from "lucide-react";

interface MeetupRow {
  id: string;
  buyer_id: string;
  seller_id: string;
  listing_id: string;
  status: string;
  meetup_window_start: string;
  deposit_amount: number;
  listing?: { id: string; title: string };
}

const BUYER_REASONS = [
  "Schedule conflict",
  "Changed my mind",
  "Found a different option",
  "Other",
];

const SELLER_REASONS = [
  "Item no longer available",
  "Schedule conflict",
  "Buyer not responding",
  "Other",
];

function CancelMeetupPageInner() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const supabase = useMemo(() => createClient(), []);

  const [meetup, setMeetup] = useState<MeetupRow | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reason, setReason] = useState("");
  const [otherText, setOtherText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);

      const { data, error } = await supabase
        .from("meetups")
        .select(
          "id, buyer_id, seller_id, listing_id, status, meetup_window_start, deposit_amount, listing:listings!listing_id(id, title)",
        )
        .eq("id", params.id)
        .single();

      if (error || !data) {
        setLoadError("Meetup not found.");
        setLoading(false);
        return;
      }
      setMeetup(data as unknown as MeetupRow);
      setLoading(false);
    };
    load();
  }, [params.id, supabase]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-orange" />
        </main>
      </div>
    );
  }

  if (!meetup || loadError) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <AlertCircle className="w-12 h-12 text-orange mb-4" />
          <p className="font-heading text-lg font-bold text-navy mb-2">
            {loadError || "Something went wrong"}
          </p>
        </main>
      </div>
    );
  }

  const isSeller = userId === meetup.seller_id;
  const role: "buyer" | "seller" = isSeller ? "seller" : "buyer";
  const reasons = role === "seller" ? SELLER_REASONS : BUYER_REASONS;

  const start = new Date(meetup.meetup_window_start);
  const hoursUntil = (start.getTime() - Date.now()) / 3600000;
  // Mirrors LATE_CANCEL_HOURS in /api/meetups/[id]/cancel. This copy drives the
  // warning only — the route decides the money outcome server-side, and the two
  // must agree or a buyer is told one thing and charged another.
  const isLate = hoursUntil < 24;

  const alreadyCancelled = meetup.status.startsWith("cancelled");
  const reasonValid =
    reason && (reason !== "Other" || otherText.trim().length > 0);

  const handleCancel = async () => {
    if (!meetup) return;
    setSubmitting(true);
    setSubmitError("");

    // Server-side since Phase 3 Step 6: cancelling has to freeze the order's
    // auto-release, and the browser can't write `orders` (no RLS UPDATE policy,
    // by design). The route owns the status change, the listing, the freeze and
    // the counterparty notification.
    try {
      const res = await fetch(`/api/meetups/${meetup.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: reason === "Other" ? otherText : reason,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };

      if (!res.ok) {
        setSubmitError(
          body.message || "Could not cancel this meetup. Please try again.",
        );
        setSubmitting(false);
        return;
      }

      router.push("/profile/meetups");
    } catch {
      setSubmitError("Network error. Please try again.");
      setSubmitting(false);
    }
  };

  if (alreadyCancelled) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="font-heading text-lg font-bold text-navy mb-2">
            This meetup is already cancelled.
          </p>
          <Link href="/profile/meetups" className="mt-4 inline-block">
            <Button variant="outline" className="btn-large">
              Back to Meetups
            </Button>
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="sticky top-0 z-40 bg-white border-b">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="p-2 rounded-full hover:bg-gray-100"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-navy" />
          </button>
          <p className="font-heading text-sm font-bold text-navy">
            Cancel Meetup
          </p>
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-5 pb-28">
        {/*
          Four distinct outcomes — role x lateness. The 24h boundary only
          applies to BUYERS: a seller cancelling at any time refunds the buyer
          in full, because the buyer did nothing wrong.

          Only the buyer-inside-24h case is reviewed. Never tell someone their
          money is coming back instantly when it is going to a review queue.
        */}
        {role === "buyer" && !isLate && (
          <>
            <h1 className="font-heading text-2xl font-bold text-navy mb-2">
              Cancel this meetup?
            </h1>
            <p className="text-sm text-muted-foreground">
              You&apos;re outside the 24-hour window, so you&apos;ll be{" "}
              <strong>refunded in full</strong> — the item price and the Buyer
              Protection fee.
            </p>
          </>
        )}

        {role === "buyer" && isLate && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-heading text-lg font-bold text-amber-900">
                  Late cancellation
                </p>
                <p className="text-sm text-amber-900 mt-1 leading-relaxed">
                  Because your meetup is within 24 hours, your cancellation
                  will be <strong>reviewed before a refund is issued</strong>.
                  Your payment stays held until our team decides. A late
                  cancellation may also count against your account.
                </p>
              </div>
            </div>
          </div>
        )}

        {role === "seller" && !isLate && (
          <>
            <h1 className="font-heading text-2xl font-bold text-navy mb-2">
              Cancel this meetup?
            </h1>
            <p className="text-sm text-muted-foreground">
              The buyer will be <strong>refunded in full</strong>. Cancelling
              doesn&apos;t cost you anything, but repeated cancellations affect
              your standing.
            </p>
          </>
        )}

        {role === "seller" && isLate && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-red-700 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-heading text-lg font-bold text-red-900">
                  Late seller cancellation
                </p>
                <p className="text-sm text-red-900 mt-1 leading-relaxed">
                  The buyer will be <strong>refunded in full</strong>.
                  Cancelling this close to the meetup may count against your
                  account — see community guidelines.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-navy">
              Reason
            </Label>
            <Select value={reason} onValueChange={(v) => setReason(v ?? "")}>
              <SelectTrigger className="min-h-[44px] bg-white">
                <SelectValue placeholder="Pick a reason" />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {reason === "Other" && (
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-navy">
                Tell us more
              </Label>
              <Textarea
                rows={3}
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                placeholder="Share what happened (helps us improve)"
                className="text-base"
              />
            </div>
          )}

          {submitError && (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {submitError}
            </div>
          )}
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-3">
        <div className="max-w-lg mx-auto flex gap-2">
          <Button
            variant="outline"
            className="btn-large flex-1"
            onClick={() => router.back()}
            disabled={submitting}
          >
            Keep Meetup
          </Button>
          <Button
            onClick={handleCancel}
            disabled={!reasonValid || submitting}
            className="btn-large flex-1 bg-red-600 hover:bg-red-700 text-white"
          >
            {submitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <X className="w-5 h-5" />
            )}
            {isLate ? "Yes, Cancel Anyway" : "Cancel Meetup"}
          </Button>
        </div>
      </div>
    </div>
  );
}

import { AuthGate } from "@/components/auth-gate";

export default function CancelMeetupPage() {
  return (
    <AuthGate reason="Sign in to cancel this meetup.">
      <CancelMeetupPageInner />
    </AuthGate>
  );
}
