"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Heart, Star, MapPin, ImageIcon, ShieldCheck } from "lucide-react";
import { formatCondition } from "@/lib/utils";
import { isSavedLocal, toggleSavedLocal } from "@/lib/wishlist";
import type { Listing, User } from "@/types/database";

interface ListingCardProps {
  listing: Listing & { seller?: Pick<User, "full_name" | "avg_rating" | "city"> };
  initiallySaved?: boolean;
}

const conditionColors: Record<string, string> = {
  like_new: "bg-green-100 text-green-800",
  good: "bg-blue-100 text-blue-800",
  fair: "bg-yellow-100 text-yellow-800",
  poor: "bg-red-100 text-red-800",
};

export function ListingCard({ listing, initiallySaved = false }: ListingCardProps) {
  const [saved, setSaved] = useState(initiallySaved);
  const price = (listing.price / 100).toFixed(0);

  useEffect(() => {
    setSaved(isSavedLocal(listing.id));
  }, [listing.id]);

  const toggleSave = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSaved(toggleSavedLocal(listing.id));
  };

  return (
    <Link href={`/listings/${listing.id}`}>
      <div className="listing-card-mobile">
        <div className="aspect-square relative bg-white overflow-hidden">
          {listing.photo_urls.length > 0 ? (
            <img
              src={listing.photo_urls[0]}
              alt={listing.title}
              className="w-full h-full object-contain"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-200">
              <ImageIcon className="w-12 h-12" />
            </div>
          )}

          <button
            type="button"
            onClick={toggleSave}
            aria-label={saved ? "Unsave" : "Save"}
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow-sm hover:bg-white"
          >
            <Heart
              className={`w-4 h-4 ${saved ? "fill-red-500 text-red-500" : "text-navy"}`}
            />
          </button>

          <Badge className="absolute top-2 left-2 bg-navy/90 text-white text-[11px] font-semibold h-6">
            {listing.sport}
          </Badge>
          <Badge
            className={`absolute bottom-2 left-2 text-[11px] font-semibold h-6 ${conditionColors[listing.condition] || ""}`}
          >
            {formatCondition(listing.condition)}
          </Badge>
          {listing.ai_confidence !== null && listing.ai_confidence !== undefined && listing.ai_confidence > 0.7 && (
            <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-white/90 rounded-full px-2 py-0.5 text-[10px] text-navy font-medium">
              <ShieldCheck className="w-3 h-3 text-green-600" /> AI Verified
            </div>
          )}
        </div>

        <div className="p-3">
          <h3 className="font-heading font-semibold text-navy text-sm leading-tight line-clamp-2 min-h-[2.25rem]">
            {listing.title}
          </h3>
          <p className="text-xl font-bold text-orange mt-1">${price}</p>

          {listing.ai_age_range && (
            <p className="text-[11px] text-muted-foreground mt-1">
              Ages {listing.ai_age_range}
            </p>
          )}

          {listing.seller && (
            <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Star className="w-3 h-3 fill-orange text-orange" />
                <span>{listing.seller.avg_rating?.toFixed(1) || "New"}</span>
              </div>
              {(listing.city || listing.seller.city) && (
                <div className="flex items-center gap-0.5">
                  <MapPin className="w-3 h-3" />
                  <span className="truncate max-w-[80px]">
                    {listing.city || listing.seller.city}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
