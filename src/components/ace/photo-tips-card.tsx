import { Camera } from "lucide-react";

const TIPS = [
  "Natural light — go near a window",
  "White or neutral background",
  "Fill the frame with the item",
  "Show brand labels clearly",
  "Photograph any wear or damage",
  "3-5 photos gets best AI analysis",
];

export function PhotoTipsCard() {
  return (
    <div className="bg-white border-2 border-orange/30 rounded-2xl p-4 my-1 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Camera className="w-4 h-4 text-orange" />
        <p className="font-heading font-bold text-navy">
          📸 Photo Tips for Better Offers
        </p>
      </div>
      <ul className="space-y-1.5 text-sm text-navy">
        {TIPS.map((t) => (
          <li key={t} className="flex items-start gap-2">
            <span className="text-orange flex-shrink-0 mt-1">•</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-orange font-semibold mt-3">
        More photos = higher AI confidence = better price 💰
      </p>
    </div>
  );
}
