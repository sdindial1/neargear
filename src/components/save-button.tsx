"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { isSavedLocal, toggleSavedLocal } from "@/lib/wishlist";

interface Props {
  listingId?: string;
  initiallySaved?: boolean;
  className?: string;
  size?: number;
}

export function SaveButton({
  listingId,
  initiallySaved = false,
  className,
  size = 20,
}: Props) {
  const [saved, setSaved] = useState(initiallySaved);

  useEffect(() => {
    if (listingId) setSaved(isSavedLocal(listingId));
  }, [listingId]);

  const onClick = () => {
    if (listingId) setSaved(toggleSavedLocal(listingId));
    else setSaved((s) => !s);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={saved ? "Unsave" : "Save"}
      className={className}
    >
      <Heart
        style={{ width: size, height: size }}
        className={saved ? "fill-red-500 text-red-500" : "text-navy"}
      />
    </button>
  );
}
