"use client";

import { useEffect, useMemo, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { Navbar } from "@/components/navbar";
import { BottomNav } from "@/components/bottom-nav";
import { AuthGate } from "@/components/auth-gate";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  XCircle,
} from "lucide-react";

interface MeetupRow {
  id: string;
  status: string;
  buyer_id: string;
  seller_id: string;
  listing_id: string | null;
  no_show_reported_by: string | null;
  listing: { title: string } | null;
}

function NoShowInner({ id }: { id: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [meetup, setMeetup] = useState<MeetupRow | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);

      const { data, error: loadErr } = await supabase
        .from("meetups")
        .select(
          "id, status, buyer_id, seller_id, listing_id, no_show_reported_by, listing:listings!listing_id(title)",
        )
        .eq("id", id)
        .single();

      if (loadErr || !data) {
        setError("Meetup not found.");
        setLoading(false);
        return;
      }
      const m = data as unknown as MeetupRow;
      if (m.buyer_id !== user.id && m.seller_id !== user.id) {
        setError("You don't have access to this meetup.");
        setLoading(false);
        return;
      }
      setMeetup(m);
      setLoading(false);
    };
    load();
  }, [id, supabase]);

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

  if (error || !meetup || !userId) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Navbar />
        <main className="page-with-nav flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <AlertTriangle className="w-12 h-12 mx-auto text-orange mb-3" />
            <p className="text-navy font-semibold">
              {error || "Meetup unavailable"}
            </p>
            <Link
              href="/profile/meetups"
              className="text-sm text-orange mt-3 inline-block"
            >
              Back to meetups
            </Link>
          </div>
        </main>
        <BottomNav />
      </div>
    );
  }

  if (meetup.status !== "scheduled") {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Navbar />
        <main className="page-with-nav flex-1 flex items-center justify-center px-4">
          <div className="text-center max-w-sm">
            <CheckCircle2 className="w-12 h-12 mx-auto text-green-500 mb-3" />
            <p className="text-navy font-semibold">
              This meetup is already {meetup.status.replace(/_/g, " ")}.
            </p>
            <Link
              href={`/meetups/${meetup.id}`}
              className="text-sm text-orange mt-3 inline-block"
            >
              View meetup
            </Link>
          </div>
        </main>
        <BottomNav />
      </div>
    );
  }

  const isBuyer = meetup.buyer_id === userId;
  const role: "buyer" | "seller" = isBuyer ? "buyer" : "seller";
  const otherParty = isBuyer ? "Seller" : "Buyer";
  const consequence = isBuyer
    ? "The seller will receive a strike and your deposit will be refunded."
    : "The buyer will receive a strike and you keep their deposit.";
  const listingTitle = meetup.listing?.title ?? "your item";

  const reportNoShow = async () => {
    if (submitting) return;
    setSubmitting(true);
    const res = await fetch(`/api/meetups/${meetup.id}/no-show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error || `Failed (${res.status})`);
      return;
    }

    toast.success("Reported. Thanks for letting us know.");
    router.push("/profile/meetups");
    router.refresh();
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="page-with-nav flex-1">
        <div className="max-w-md mx-auto w-full px-4 py-6">
          <Link
            href={`/meetups/${meetup.id}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4"
          >
            <ChevronLeft className="w-4 h-4" /> Back to meetup
          </Link>

          <h1 className="font-heading text-2xl font-bold text-navy mb-1">
            What happened at your meetup?
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            For{" "}
            <span className="font-semibold text-navy">{listingTitle}</span>
          </p>

          <div className="space-y-3">
            <Link href={`/meetups/${meetup.id}`} className="block">
              <Button className="w-full min-h-[60px] bg-green-500 hover:bg-green-600 text-white text-base font-bold">
                <CheckCircle2 className="w-6 h-6" />
                Meetup went great!
              </Button>
            </Link>

            <Button
              variant="outline"
              onClick={() => setConfirming(true)}
              className="w-full min-h-[60px] border-red-300 text-red-600 hover:bg-red-50 text-base font-semibold"
            >
              <XCircle className="w-5 h-5" />
              {otherParty} didn&apos;t show up
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center mt-6">
            If you can&apos;t agree on what happened, our team will review
            from the messaging history.
          </p>
        </div>
      </main>

      {confirming && (
        <>
          <div
            className="fixed inset-0 z-[70] bg-black/50"
            onClick={() => setConfirming(false)}
            aria-hidden
          />
          <div className="fixed inset-x-0 bottom-0 z-[71] sm:inset-0 sm:flex sm:items-center sm:justify-center safe-bottom">
            <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm sm:m-4 p-5">
              <div className="text-center mb-4">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <h2 className="font-heading text-lg font-bold text-navy">
                  Report {otherParty.toLowerCase()} as no-show?
                </h2>
                <p className="text-sm text-muted-foreground mt-2">
                  {consequence}
                </p>
              </div>
              <div className="space-y-2">
                <Button
                  onClick={reportNoShow}
                  disabled={submitting}
                  className="w-full min-h-[48px] bg-red-600 hover:bg-red-700 text-white"
                >
                  {submitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : null}
                  Yes, Report
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setConfirming(false)}
                  disabled={submitting}
                  className="w-full min-h-[48px]"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      <BottomNav />
    </div>
  );
}

export default function NoShowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <AuthGate reason="Sign in to report on your meetup.">
      <NoShowInner id={id} />
    </AuthGate>
  );
}
