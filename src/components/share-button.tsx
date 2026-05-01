"use client";

import { Share2 } from "lucide-react";
import toast from "react-hot-toast";

interface Props {
  title: string;
  text: string;
  url?: string;
  className?: string;
  label?: string;
}

/**
 * Tries the Web Share API first (iOS/Android system sheet); falls back to
 * copying the URL with a toast. URL defaults to the current page.
 */
export function ShareButton({
  title,
  text,
  url,
  className,
  label,
}: Props) {
  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault();
    const shareUrl =
      url ?? (typeof window !== "undefined" ? window.location.href : "");
    const canShare =
      typeof navigator !== "undefined" && typeof navigator.share === "function";

    if (canShare) {
      try {
        await navigator.share({ title, text, url: shareUrl });
        return;
      } catch (err) {
        // AbortError when user cancels the sheet — silent. Anything else,
        // fall through to clipboard.
        if ((err as { name?: string })?.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied!");
    } catch {
      toast.error("Couldn't share — copy the URL from your address bar.");
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label="Share listing"
      className={
        className ??
        "inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-orange/40 text-orange text-sm font-semibold hover:bg-orange/5"
      }
    >
      <Share2 className="w-4 h-4" />
      {label ?? "Share"}
    </button>
  );
}
