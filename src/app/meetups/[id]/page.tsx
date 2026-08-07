import { createServerSupabaseClient } from "@/lib/supabase-server";
import { Navbar } from "@/components/navbar";
import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getDirectionsUrl } from "@/lib/safezones";
import { MeetupCountdown } from "@/components/meetup-countdown";
import { CompleteTransactionSection } from "@/components/complete-transaction-section";
import { MeetupPaySection } from "@/components/meetup-pay-section";
import { MeetupSellerActions } from "@/components/meetup-seller-actions";
import { ItemDisputeButton } from "@/components/item-dispute-modal";
import {
  AlertTriangle,
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
       listing:listings!listing_id(id, title, photo_urls, price, retail_price),
       buyer:public_profiles!buyer_id(id, full_name, avg_rating, city),
       seller:public_profiles!seller_id(id, full_name, avg_rating, city, is_founding_member, stripe_payouts_enabled)`,
    )
    .eq("id", id)
    .single();

  if (!meetup) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isBuyer = user?.id === meetup.buyer_id;
  const isSeller = user?.id === meetup.seller_id;

  // Payments Phase 3: the order is the source of truth for payment AND release
  // state, so both participants load it. RLS (mig 014) limits this to them.
  //
  // A meetup can accumulate more than one order row (an abandoned 'pending'
  // checkout alongside the real one), so pick the most advanced rather than
  // assuming a single match.
  const ORDER_PRIORITY = [
    "released",
    "releasing",
    "release_failed",
    "paid_held",
    "refunded",
    "pending",
  ];
  let order: {
    id: string;
    status: string;
    buyer_confirmed_at: string | null;
    seller_confirmed_at: string | null;
    disputed_at: string | null;
    item_price_cents: number;
    seller_fee_cents: number | null;
    gross_captured_cents: number | null;
  } | null = null;

  if (isBuyer || isSeller) {
    const { data: orderRows } = await supabase
      .from("orders")
      .select(
        "id, status, buyer_confirmed_at, seller_confirmed_at, disputed_at, item_price_cents, seller_fee_cents, gross_captured_cents",
      )
      .eq("meetup_id", id);

    order =
      (orderRows ?? [])
        .slice()
        .sort(
          (a, b) =>
            ORDER_PRIORITY.indexOf(a.status) - ORDER_PRIORITY.indexOf(b.status),
        )[0] ?? null;
  }
  const orderPaid = order?.status === "paid_held";
  const otherParty = isBuyer ? meetup.seller : meetup.buyer;

  let location: {
    type?: string;
    safeZoneId?: string;
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    lat?: number;
    lng?: number;
    note?: string;
  } | null = null;
  try {
    if (meetup.meetup_location) location = JSON.parse(meetup.meetup_location);
  } catch {
    location = null;
  }
  const locType = location?.type ?? "safe_zone";
  const isCustomLoc = locType === "custom";
  const isHomeLoc = locType === "home_buyer" || locType === "home_seller";

  const status = STATUS_META[meetup.status] || {
    label: meetup.status,
    className: "bg-gray-200 text-gray-700",
  };

  const offered = (meetup.offered_price / 100).toFixed(2);
  const start = new Date(meetup.meetup_window_start);
  const end = new Date(meetup.meetup_window_end);

  // "Report Item Issue" is buyer-only and only during the active window
  // for a scheduled meetup.
  const now = Date.now();
  const inWindow = now >= start.getTime() && now <= end.getTime();
  const showItemDispute =
    isBuyer && meetup.status === "scheduled" && inWindow;

  const directionsUrl = location
    ? getDirectionsUrl({
        lat: location.lat ?? null,
        lng: location.lng ?? null,
        address: location.address ?? null,
        label: location.name ?? null,
      })
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />

      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-5 pb-28">
        <Badge className={`${status.className} font-semibold mb-3`}>
          {status.label}
        </Badge>

        {meetup.status === "scheduled" && (
          <MeetupCountdown
            windowStart={meetup.meetup_window_start}
            windowEnd={meetup.meetup_window_end}
            className="mb-4"
          />
        )}

        {isSeller &&
          ["requested", "countered"].includes(meetup.status) && (
            <MeetupSellerActions
              meetupId={meetup.id}
              listingId={meetup.listing_id ?? null}
            />
          )}

        {isBuyer && meetup.status === "scheduled" && (
          <div className="mb-4">
            <MeetupPaySection
              meetupId={meetup.id}
              offeredPriceCents={meetup.offered_price ?? 0}
              sellerIsFoundingMember={Boolean(meetup.seller?.is_founding_member)}
              sellerPayoutsEnabled={Boolean(
                meetup.seller?.stripe_payouts_enabled,
              )}
              initialPaid={orderPaid}
            />
          </div>
        )}

        {user &&
          (user.id === meetup.buyer_id || user.id === meetup.seller_id) &&
          [
            "scheduled",
            "buyer_confirmed",
            "seller_confirmed",
            "payment_processing",
            "completed",
          ].includes(meetup.status) && (
            <div className="mb-4">
              <CompleteTransactionSection
                meetupId={meetup.id}
                currentUserId={user.id}
                buyerId={meetup.buyer_id}
                sellerId={meetup.seller_id}
                orderId={order?.id ?? null}
                orderStatus={order?.status ?? null}
                buyerConfirmedAt={order?.buyer_confirmed_at ?? null}
                sellerConfirmedAt={order?.seller_confirmed_at ?? null}
                disputedAt={order?.disputed_at ?? null}
                itemPriceCents={
                  order?.item_price_cents ?? meetup.offered_price ?? 0
                }
                retailPriceCents={meetup.listing?.retail_price ?? null}
                // Both values come straight from the order row, so the figure
                // the seller sees is the one that was actually transferred.
                // Null unless the order exists and the fee was recorded — the
                // UI then omits the amount rather than guessing one.
                sellerPayoutCents={
                  order != null && order.seller_fee_cents != null
                    ? order.item_price_cents - order.seller_fee_cents
                    : null
                }
                buyerPaidCents={order?.gross_captured_cents ?? null}
              />
            </div>
          )}

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
                {isCustomLoc && (
                  <span className="ml-1 text-[10px] font-semibold bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">
                    Custom
                  </span>
                )}
                {isHomeLoc && (
                  <span className="ml-1 text-[10px] font-semibold bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">
                    Home
                  </span>
                )}
              </p>
              <p className="font-semibold text-navy mt-1">
                {location.name ||
                  (locType === "home_buyer"
                    ? "Buyer's home"
                    : locType === "home_seller"
                      ? "Seller's home"
                      : "Location")}
              </p>
              <p className="text-sm text-muted-foreground">
                {location.address ||
                  (locType === "home_seller"
                    ? "Seller will share address after accepting."
                    : "")}
                {location.city ? `, ${location.city}` : ""}
                {location.state ? `, ${location.state}` : ""}
                {location.zip ? ` ${location.zip}` : ""}
              </p>
              {location.note && (
                <p className="text-xs text-muted-foreground mt-1 italic">
                  {location.note}
                </p>
              )}
              {isHomeLoc && (
                <p className="text-xs text-amber-800 mt-2 leading-relaxed">
                  ⚠️ Home meetup — make sure you&apos;re comfortable before
                  accepting.
                </p>
              )}
              {meetup.status === "scheduled" && directionsUrl && (
                <a
                  href={directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 mt-3 w-full h-11 rounded-xl bg-orange text-white font-semibold text-sm"
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
            {meetup.seller?.is_founding_member && (
              <div className="flex justify-between pt-1">
                <dt className="text-muted-foreground">NearGear Fee</dt>
                <dd className="font-semibold text-green-700 tabular-nums">
                  $0.00{" "}
                  <span className="text-[11px] font-normal text-green-700/80">
                    (Founding Family ⭐)
                  </span>
                </dd>
              </div>
            )}
          </dl>
        </div>

        {showItemDispute && (
          <div className="mt-4 text-center">
            <ItemDisputeButton
              meetupId={meetup.id}
              trigger={
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-red-300 text-red-600 text-xs font-semibold hover:bg-red-50"
                >
                  <AlertTriangle className="w-3.5 h-3.5" /> Report Item Issue
                </button>
              }
            />
          </div>
        )}
      </main>

      <div className="fixed bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom,0px))] md:bottom-0 left-0 right-0 bg-white border-t p-3">
        <div className="max-w-lg mx-auto flex gap-2">
          <Link href={`/meetups/${meetup.id}/messages`} className="flex-1">
            <Button variant="outline" className="btn-large w-full">
              <MessageCircle className="w-5 h-5" /> Message
            </Button>
          </Link>
          {["requested", "scheduled", "countered"].includes(meetup.status) && (
            <Link href={`/meetups/${meetup.id}/cancel`} className="flex-1">
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
