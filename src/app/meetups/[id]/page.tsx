import { createServerSupabaseClient } from "@/lib/supabase-server";
import { Navbar } from "@/components/navbar";
import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getUniversalDirectionsUrl } from "@/lib/safezones";
import {
  Calendar,
  Clock,
  ImageIcon,
  MapPin,
  MessageCircle,
  Navigation,
  User as UserIcon,
  X,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

const STATUS_META: Record<string, { label: string; className: string }> = {
  requested: {
    label: "Requested",
    className: "bg-amber-100 text-amber-800",
  },
  countered: {
    label: "Countered",
    className: "bg-blue-100 text-blue-800",
  },
  scheduled: {
    label: "Scheduled",
    className: "bg-green-100 text-green-800",
  },
  completed: {
    label: "Completed",
    className: "bg-gray-200 text-gray-700",
  },
  cancelled_buyer: {
    label: "Cancelled by buyer",
    className: "bg-red-100 text-red-700",
  },
  cancelled_seller: {
    label: "Declined by seller",
    className: "bg-red-100 text-red-700",
  },
  cancelled_auto: {
    label: "Expired",
    className: "bg-gray-200 text-gray-600",
  },
  no_show_buyer: {
    label: "Buyer no-show",
    className: "bg-red-100 text-red-700",
  },
  no_show_seller: {
    label: "Seller no-show",
    className: "bg-red-100 text-red-700",
  },
  disputed: {
    label: "Disputed",
    className: "bg-red-100 text-red-800",
  },
};

function formatHour(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
}

export default async function MeetupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: meetup } = await supabase
    .from("meetups")
    .select(
      `*,
       listing:listings!listing_id(id, title, photo_urls, price),
       buyer:users!buyer_id(id, full_name, avg_rating, city),
       seller:users!seller_id(id, full_name, avg_rating, city)`,
    )
    .eq("id", id)
    .single();

  if (!meetup) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isBuyer = user?.id === meetup.buyer_id;
  const otherParty = isBuyer ? meetup.seller : meetup.buyer;

  let location: {
    safeZoneId?: string;
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    lat?: number;
    lng?: number;
  } | null = null;
  try {
    if (meetup.meetup_location) location = JSON.parse(meetup.meetup_location);
  } catch {
    location = null;
  }

  const status = STATUS_META[meetup.status] || {
    label: meetup.status,
    className: "bg-gray-200 text-gray-700",
  };

  const offered = (meetup.offered_price / 100).toFixed(2);
  const depositDollars = ((meetup.deposit_amount || 0) / 100).toFixed(2);
  const start = new Date(meetup.meetup_window_start);
  const end = new Date(meetup.meetup_window_end);

  const directionsUrl =
    location?.lat && location?.lng
      ? getUniversalDirectionsUrl(
          location.lat,
          location.lng,
          location.name,
        )
      : null;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />

      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-5 pb-28">
        <Badge className={`${status.className} font-semibold mb-3`}>
          {status.label}
        </Badge>

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
            <Link
              href={`/listings/${meetup.listing?.id}`}
              className="font-semibold text-navy line-clamp-2"
            >
              {meetup.listing?.title}
            </Link>
            <p className="font-heading text-2xl font-bold text-orange mt-1 tabular-nums">
              ${offered}
            </p>
          </div>
        </div>

        {otherParty && (
          <div className="bg-white rounded-2xl border p-4 mb-4">
            <p className="text-xs text-muted-foreground mb-2">
              {isBuyer ? "Seller" : "Buyer"}
            </p>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange flex items-center justify-center text-white font-bold">
                {otherParty.full_name?.charAt(0) || <UserIcon className="w-5 h-5" />}
              </div>
              <div>
                <p className="font-semibold text-navy">
                  {otherParty.full_name || "Anonymous"}
                </p>
                {otherParty.city && (
                  <p className="text-xs text-muted-foreground">{otherParty.city}</p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border divide-y mb-4">
          <div className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Date
            </p>
            <p className="font-semibold text-navy mt-1">
              {start.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
          <div className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" /> Window
            </p>
            <p className="font-semibold text-navy mt-1">
              {formatHour(start)} – {formatHour(end)}
            </p>
          </div>
          {location && (
            <div className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Location
              </p>
              <p className="font-semibold text-navy mt-1">{location.name}</p>
              <p className="text-sm text-muted-foreground">
                {location.address}
                {location.city ? `, ${location.city}` : ""}
                {location.state ? `, ${location.state}` : ""}
                {location.zip ? ` ${location.zip}` : ""}
              </p>
              {directionsUrl && (
                <a
                  href={directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-3 text-sm font-semibold text-orange"
                >
                  <Navigation className="w-4 h-4" />
                  Get Directions
                </a>
              )}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border p-4 mb-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Payment
          </p>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Offered price</dt>
              <dd className="font-semibold text-navy tabular-nums">
                ${offered}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Deposit</dt>
              <dd className="font-semibold text-navy tabular-nums">
                ${depositDollars}
              </dd>
            </div>
          </dl>
        </div>
      </main>

      <div className="fixed bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom,0px))] md:bottom-0 left-0 right-0 bg-white border-t p-3">
        <div className="max-w-lg mx-auto flex gap-2">
          <Link href="/messages" className="flex-1">
            <Button variant="outline" className="btn-large w-full">
              <MessageCircle className="w-5 h-5" /> Message
            </Button>
          </Link>
          {["requested", "scheduled", "countered"].includes(meetup.status) && (
            <Link href="/profile/meetups" className="flex-1">
              <Button
                variant="outline"
                className="btn-large w-full text-red-600 border-red-200"
              >
                <X className="w-5 h-5" />
                Cancel
              </Button>
            </Link>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
