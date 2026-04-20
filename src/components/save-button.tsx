"use client";

import { useState } from "react";
import { Heart } from "lucide-react";

interface Props {
  initiallySaved?: boolean;
  className?: string;
  size?: number;
}

export function SaveButton({ initiallySaved = false, className, size = 20 }: Props) {
  const [saved, setSaved] = useState(initiallySaved);
  return (
    <button
      type="button"
      onClick={() => setSaved((s) => !s)}
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
