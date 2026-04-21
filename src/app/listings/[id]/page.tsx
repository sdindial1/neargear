import { createServerSupabaseClient } from "@/lib/supabase-server";
import { Navbar } from "@/components/navbar";
import { BottomNav } from "@/components/bottom-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SaveButton } from "@/components/save-button";
import { SizeRecommendation } from "@/components/size-recommendation";
import { ListingCard } from "@/components/listing-card";
import { formatCondition } from "@/lib/utils";
import {
  Calendar,
  Eye,
  Handshake,
  ImageIcon,
  MapPin,
  ShieldCheck,
  Star,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Listing, User } from "@/types/database";

const conditionColors: Record<string, string> = {
  like_new: "bg-green-100 text-green-800",
  good: "bg-blue-100 text-blue-800",
  fair: "bg-yellow-100 text-yellow-800",
  poor: "bg-red-100 text-red-800",
};

export default async function ListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: listing } = await supabase
    .from("listings")
    .select(
      "*, seller:users!seller_id(full_name, avg_rating, review_count, city, avatar_url, created_at)",
    )
    .eq("id", id)
    .single();

  if (!listing) notFound();

  await supabase
    .from("listings")
    .update({ views: (listing.views || 0) + 1 })
    .eq("id", id);

  const { data: similar } = await supabase
    .from("listings")
    .select("*, seller:users!seller_id(full_name, avg_rating, city)")
    .eq("status", "active")
    .eq("sport", listing.sport)
    .neq("id", listing.id)
    .order("created_at", { ascending: false })
    .limit(6);

  const price = (listing.price / 100).toFixed(0);
  const aiPrice = listing.ai_suggested_price
    ? (listing.ai_suggested_price / 100).toFixed(0)
    : null;
  const createdAt = new Date(listing.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const sellerJoined = listing.seller?.created_at
    ? new Date(listing.seller.created_at).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : null;

  const sizeAge =
    listing.age_min != null && listing.age_max != null
      ? Math.floor((listing.age_min + listing.age_max) / 2)
      : listing.age_min ?? null;

  type Seller = Pick<User, "full_name" | "avg_rating" | "city">;
  const similarListings = (similar as (Listing & { seller?: Seller })[]) || [];

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />

      <main className="page-with-nav flex-1">
        <div className="relative">
          {listing.photo_urls?.length > 0 ? (
            <div className="photo-gallery">
              {listing.photo_urls.map((url: string, i: number) => (
                <div key={i} className="photo-gallery-item">
                  <img
                    src={url}
                    alt={`${listing.title} photo ${i + 1}`}
                    className="w-full h-full object-contain bg-white"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="aspect-square bg-white flex items-center justify-center text-gray-200">
              <ImageIcon className="w-24 h-24" />
            </div>
          )}

          {listing.photo_urls?.length > 1 && (
            <div className="absolute bottom-3 right-3 bg-black/50 text-white text-xs px-2.5 py-1 rounded-full">
              {listing.photo_urls.length} photos
            </div>
          )}
        </div>

        <div className="max-w-3xl mx-auto w-full px-4 py-4 pb-24 md:pb-8">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Badge className="bg-navy/90 text-white">{listing.sport}</Badge>
            <Badge className={conditionColors[listing.condition] || ""}>
              {formatCondition(listing.condition)}
            </Badge>
            {listing.ai_age_range && (
              <Badge className="bg-orange/10 text-orange border border-orange/20">
                Ages {listing.ai_age_range}
              </Badge>
            )}
            {listing.ai_size && (
              <Badge className="bg-navy/5 text-navy">
                {listing.ai_size}
              </Badge>
            )}
            {listing.ai_confidence != null && listing.ai_confidence >= 0.7 && (
              <Badge className="bg-green-50 text-green-700 border border-green-200">
                <ShieldCheck className="w-3 h-3 mr-1" /> AI Verified
              </Badge>
            )}
          </div>

          <h1 className="font-heading text-2xl md:text-3xl font-bold text-navy">
            {listing.title}
          </h1>
          <div className="flex items-baseline gap-3 mt-1">
            <p className="text-3xl md:text-4xl font-bold text-orange">
              ${price}
            </p>
            {aiPrice && (
              <p className="text-sm text-muted-foreground">
                AI suggested: ${aiPrice}
              </p>
            )}
          </div>

          {listing.description && (
            <div className="mt-4">
              <p className="text-sm text-navy whitespace-pre-wrap leading-relaxed">
                {listing.description}
              </p>
            </div>
          )}

          {listing.seller && (
            <div className="bg-white rounded-xl p-4 shadow-sm mt-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-orange flex items-center justify-center text-white font-bold text-lg">
                  {listing.seller.full_name?.charAt(0) || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-navy truncate">
                    {listing.seller.full_name || "Seller"}
                  </p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Star className="w-3.5 h-3.5 fill-orange text-orange" />
                    <span>{listing.seller.avg_rating?.toFixed(1) || "New"}</span>
                    <span>
                      ({listing.seller.review_count || 0} reviews)
                    </span>
                  </div>
                  {sellerJoined && (
                    <p className="text-xs text-muted-foreground">
                      Member since {sellerJoined}
                    </p>
                  )}
                </div>
                {(listing.city || listing.seller.city) && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="w-4 h-4" />
                    {listing.city || listing.seller.city}
                  </div>
                )}
              </div>
            </div>
          )}

          <Separator className="my-4" />

          <h3 className="font-heading font-semibold text-navy mb-3">
            Item details
          </h3>
          <dl className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Sport</dt>
              <dd className="font-medium text-navy">{listing.sport}</dd>
            </div>
            {listing.category && (
              <div>
                <dt className="text-muted-foreground">Category</dt>
                <dd className="font-medium text-navy">{listing.category}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Condition</dt>
              <dd className="font-medium text-navy">
                {formatCondition(listing.condition)}
              </dd>
            </div>
            {listing.ai_age_range && (
              <div>
                <dt className="text-muted-foreground">Age range</dt>
                <dd className="font-medium text-navy">
                  Ages {listing.ai_age_range}
                </dd>
              </div>
            )}
            {listing.ai_size && (
              <div>
                <dt className="text-muted-foreground">Size</dt>
                <dd className="font-medium text-navy">{listing.ai_size}</dd>
              </div>
            )}
            {listing.ai_brand && (
              <div>
                <dt className="text-muted-foreground">Brand</dt>
                <dd className="font-medium text-navy">{listing.ai_brand}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Listed</dt>
              <dd className="font-medium text-navy">{createdAt}</dd>
            </div>
          </dl>

          {sizeAge != null && (
            <div className="mt-6">
              <SizeRecommendation age={sizeAge} sport={listing.sport} />
            </div>
          )}

          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-6">
            <div className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> {createdAt}
            </div>
            <div className="flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" /> {listing.views || 0} views
            </div>
          </div>

          {similarListings.length > 0 && (
            <section className="mt-10">
              <h3 className="font-heading text-lg font-bold text-navy mb-4">
                More {listing.sport} gear
              </h3>
              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                {similarListings.map((l) => (
                  <div key={l.id} className="w-44 flex-shrink-0">
                    <ListingCard listing={l} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="fixed bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom,0px))] md:bottom-0 left-0 right-0 bg-white border-t p-3 md:relative md:border-0 md:p-0 md:max-w-3xl md:mx-auto md:mb-8">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <div className="flex-shrink-0">
              <p className="text-2xl font-bold text-orange leading-none">
                ${price}
              </p>
            </div>
            <SaveButton
              className="flex-shrink-0 w-11 h-11 rounded-xl border bg-white flex items-center justify-center"
              size={22}
            />
            <Link
              href={`/messages?listing=${listing.id}`}
              className="flex-1"
            >
              <Button className="btn-large btn-primary">
                <Handshake className="w-5 h-5" /> Book Meetup
              </Button>
            </Link>
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
