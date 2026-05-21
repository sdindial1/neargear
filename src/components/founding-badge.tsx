import { Star } from "lucide-react";

interface Props {
  size?: "sm" | "md";
  shimmer?: boolean;
  className?: string;
}

export function FoundingBadge({
  size = "sm",
  shimmer = false,
  className = "",
}: Props) {
  if (shimmer) {
    return (
      <span
        className={`founding-shimmer-badge ${className}`}
        title="NearGear Founding Family"
      >
        <Star className="w-3.5 h-3.5 fill-white" />
        Founding Family
      </span>
    );
  }
  if (size === "md") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange/10 border border-orange/30 text-orange text-sm font-semibold ${className}`}
        title="NearGear Founding Family"
      >
        <Star className="w-4 h-4 fill-orange" />
        NearGear Founding Family
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange/10 border border-orange/30 text-orange text-[11px] font-semibold ${className}`}
      title="NearGear Founding Family"
    >
      <Star className="w-3 h-3 fill-orange" />
      Founding Family
    </span>
  );
}
