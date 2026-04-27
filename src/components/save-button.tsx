"use client";

import { useEffect, useMemo, useState } from "react";
import { Heart } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getSavedState, toggleSaved } from "@/lib/wishlist";

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
  const supabase = useMemo(() => createClient(), []);
  const [saved, setSaved] = useState(initiallySaved);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!listingId) return;
    let alive = true;
    getSavedState(supabase, listingId).then((s) => {
      if (alive) setSaved(s);
    });
    return () => {
      alive = false;
    };
  }, [listingId, supabase]);

  const onClick = async () => {
    if (!listingId || busy) {
      setSaved((s) => !s);
      return;
    }
    setBusy(true);
    setSaved((s) => !s);
    const actual = await toggleSaved(supabase, listingId);
    setSaved(actual);
    setBusy(false);
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
