"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Navbar } from "@/components/navbar";
import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, Loader2 } from "lucide-react";

interface MeetupCtx {
  id: string;
  buyer_id: string;
  seller_id: string;
  listing_id: string;
  listing?: { title: string };
  buyer?: { full_name: string | null };
  seller?: { full_name: string | null };
}

function ReviewInner() {
  const router = useRouter();
  const params = useParams<{ meetup_id: string }>();
  const supabase = useMemo(() => createClient(), []);

  const [meetup, setMeetup] = useState<MeetupCtx | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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

      const { data } = await supabase
        .from("meetups")
        .select(
          `id, buyer_id, seller_id, listing_id,
           listing:listings!listing_id(title),
           buyer:users!buyer_id(full_name),
           seller:users!seller_id(full_name)`,
        )
        .eq("id", params.meetup_id)
        .single();

      if (data) setMeetup(data as unknown as MeetupCtx);
      setLoading(false);
    };
    load();
  }, [params.meetup_id, supabase]);

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

  if (!meetup || !userId) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <p className="font-heading text-lg font-bold text-navy">
            Meetup not found.
          </p>
        </main>
        <BottomNav />
      </div>
    );
  }

  const isBuyer = userId === meetup.buyer_id;
  const revieweeId = isBuyer ? meetup.seller_id : meetup.buyer_id;
  const revieweeName =
    (isBuyer ? meetup.seller?.full_name : meetup.buyer?.full_name) ||
    "the other party";

  const handleSubmit = async () => {
    if (!rating) return;
    setSubmitting(true);
    setError("");

    const { error: insErr } = await supabase.from("reviews").insert({
      reviewer_id: userId,
      reviewee_id: revieweeId,
      listing_id: meetup.listing_id,
      rating,
      comment: comment.trim() || null,
    });

    if (insErr) {
      setError(insErr.message);
      setSubmitting(false);
      return;
    }

    router.push("/");
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />

      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6 pb-28">
        <h1 className="font-heading text-2xl font-bold text-navy mb-1">
          Leave a Review
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          How was your experience with{" "}
          <span className="font-semibold text-navy">{revieweeName}</span>?
        </p>

        <div className="bg-white rounded-2xl border p-5 space-y-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Rating
            </p>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  aria-label={`${n} stars`}
                  className="p-1"
                >
                  <Star
                    className={`w-10 h-10 ${
                      n <= rating
                        ? "fill-orange text-orange"
                        : "text-gray-300"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Tell others (optional)
            </p>
            <Textarea
              rows={4}
              placeholder="What went well? Anything to share?"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="text-base"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">
              {error}
            </p>
          )}
        </div>
      </main>

      <div className="fixed bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom,0px))] md:bottom-0 left-0 right-0 bg-white border-t p-3">
        <div className="max-w-lg mx-auto flex gap-2">
          <Link href="/" className="flex-1">
            <Button variant="outline" className="btn-large w-full">
              Skip
            </Button>
          </Link>
          <Button
            onClick={handleSubmit}
            disabled={!rating || submitting}
            className="btn-large flex-1 btn-primary"
          >
            {submitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              "Submit Review"
            )}
          </Button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}

import { AuthGate } from "@/components/auth-gate";

export default function ReviewPage() {
  return (
    <AuthGate reason="Sign in to leave a review.">
      <ReviewInner />
    </AuthGate>
  );
}
