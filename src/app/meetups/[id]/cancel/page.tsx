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
  notifyWishlistReactivation,
  logCounterPartyNotification,
} from "@/lib/notifications";
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

export default function CancelMeetupPage() {
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

  const isBuyer = userId === meetup.buyer_id;
  const isSeller = userId === meetup.seller_id;
  const role: "buyer" | "seller" = isSeller ? "seller" : "buyer";
  const reasons = role === "seller" ? SELLER_REASONS : BUYER_REASONS;

  const start = new Date(meetup.meetup_window_start);
  const hoursUntil = (start.getTime() - Date.now()) / 3600000;
  const isLate = hoursUntil < 2;

  const depositDollars = (meetup.deposit_amount || 0) / 100;
  const lateBuyerFee = depositDollars * 0.5;

  const alreadyCancelled = meetup.status.startsWith("cancelled");
  const reasonValid =
    reason && (reason !== "Other" || otherText.trim().length > 0);

  const handleCancel = async () => {
    if (!meetup) return;
    setSubmitting(true);
    setSubmitError("");

    const newStatus =
      role === "seller" ? "cancelled_seller" : "cancelled_buyer";

    const { error: updErr } = await supabase
      .from("meetups")
      .update({ status: newStatus })
      .eq("id", meetup.id);

    if (updErr) {
      setSubmitError(updErr.message);
      setSubmitting(false);
      return;
    }

    await supabase
      .from("listings")
      .update({ status: "active" })
      .eq("id", meetup.listing_id);

    if (meetup.listing?.title) {
      await notifyWishlistReactivation(
        supabase,
        meetup.listing_id,
        meetup.listing.title,
      );
    }

    const otherUserId = isBuyer ? meetup.seller_id : meetup.buyer_id;
    logCounterPartyNotification(
      otherUserId,
      `Meetup ${meetup.id} was cancelled by ${role}: ${
        reason === "Other" ? otherText : reason
      }`,
    );

    if (isLate && role === "seller") {
      console.log(
        `[strike] Late cancellation by seller ${userId} on meetup ${meetup.id} — would record strike`,
      );
    }

    router.push("/profile/meetups");
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
        {!isLate ? (
          <>
            <h1 className="font-heading text-2xl font-bold text-navy mb-2">
              Cancel this meetup?
            </h1>
            <p className="text-sm text-muted-foreground">
              Your deposit (${depositDollars.toFixed(2)}) will be returned in
              full.
            </p>
          </>
        ) : role === "buyer" ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-heading text-lg font-bold text-amber-900">
                  Late cancellation
                </p>
                <p className="text-sm text-amber-900 mt-1 leading-relaxed">
                  Cancelling this close to the meetup means seller keeps 50% of
                  your deposit (${lateBuyerFee.toFixed(2)}).
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-red-700 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-heading text-lg font-bold text-red-900">
                  Late seller cancellation
                </p>
                <p className="text-sm text-red-900 mt-1 leading-relaxed">
                  Cancelling within 2 hours of the meetup may result in a
                  strike. See community guidelines.
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
