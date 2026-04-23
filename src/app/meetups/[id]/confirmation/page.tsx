import { createServerSupabaseClient } from "@/lib/supabase-server";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Clock,
  ImageIcon,
  MapPin,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

function formatHour(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    hour12: true,
  });
}

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: meetup } = await supabase
    .from("meetups")
    .select(
      "*, listing:listings!listing_id(id, title, photo_urls, price)",
    )
    .eq("id", id)
    .single();

  if (!meetup) notFound();

  let location: { name?: string; address?: string; city?: string } | null =
    null;
  try {
    if (meetup.meetup_location) location = JSON.parse(meetup.meetup_location);
  } catch {
    location = null;
  }

  const offered = (meetup.offered_price / 100).toFixed(2);
  const start = new Date(meetup.meetup_window_start);
  const end = new Date(meetup.meetup_window_end);
  const dateStr = start.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-8">
        <div className="text-center mb-8">
          <div className="success-pop inline-flex w-24 h-24 rounded-full bg-green-100 items-center justify-center mb-4">
            <CheckCircle2
              className="w-14 h-14 text-green-600"
              strokeWidth={2}
            />
          </div>
          <h1 className="font-heading text-3xl font-bold text-navy">
            Request Sent!
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Seller will respond soon
          </p>
        </div>

        <div className="bg-white rounded-2xl border p-3 flex gap-3 mb-4">
          <div className="w-20 h-20 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
            {meetup.listing?.photo_urls?.[0] ? (
              <img
                src={meetup.listing.photo_urls[0]}
                alt={meetup.listing.title}
                className="w-full h-full object-contain bg-white"
              />
            ) : (
              <ImageIcon className="w-8 h-8 text-gray-200" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-navy line-clamp-2">
              {meetup.listing?.title}
            </p>
            <p className="font-heading text-2xl font-bold text-orange mt-1 tabular-nums">
              ${offered}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border divide-y mb-6">
          <div className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" /> When
            </p>
            <p className="font-semibold text-navy mt-1">{dateStr}</p>
            <p className="text-sm text-muted-foreground">
              {formatHour(start)} – {formatHour(end)}
            </p>
          </div>
          {location && (
            <div className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Where
              </p>
              <p className="font-semibold text-navy mt-1">{location.name}</p>
              <p className="text-sm text-muted-foreground">
                {location.address}
                {location.city ? `, ${location.city}` : ""}
              </p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border p-4 mb-6">
          <p className="font-semibold text-navy mb-3">What&apos;s next</p>
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <span className="text-orange font-bold flex-shrink-0">1.</span>
              Seller will review your request
            </li>
            <li className="flex gap-2">
              <span className="text-orange font-bold flex-shrink-0">2.</span>
              You&apos;ll get notified when they respond
            </li>
            <li className="flex gap-2">
              <span className="text-orange font-bold flex-shrink-0">3.</span>
              If accepted, meetup is confirmed
            </li>
          </ol>
        </div>

        <div className="space-y-2">
          <Link href={`/meetups/${id}`}>
            <Button className="btn-large btn-primary">View Request</Button>
          </Link>
          <Link href="/">
            <Button variant="outline" className="btn-large w-full">
              Back to Home
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
