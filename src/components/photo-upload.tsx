"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Camera, ImagePlus, X } from "lucide-react";

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export interface PhotoUploadProps {
  photos: File[];
  onPhotosChange: (photos: File[]) => void;
  max?: number;
  min?: number;
  maxBytes?: number;
}

export function PhotoUpload({
  photos,
  onPhotosChange,
  max = 5,
  min = 3,
  maxBytes = MAX_PHOTO_BYTES,
}: PhotoUploadProps) {
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const urls = photos.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (incoming.length === 0) return;
    setError("");

    const oversize = incoming.find((f) => f.size > maxBytes);
    if (oversize) {
      const mb = Math.floor(maxBytes / 1024 / 1024);
      setError(`"${oversize.name}" is over ${mb}MB. Pick a smaller photo.`);
      return;
    }

    const remaining = max - photos.length;
    if (remaining <= 0) return;
    onPhotosChange([...photos, ...incoming.slice(0, remaining)]);
  };

  const handleRemove = (idx: number) => {
    onPhotosChange(photos.filter((_, i) => i !== idx));
  };

  const count = photos.length;
  const atCapacity = count >= max;

  if (count === 0) {
    return (
      <div className="space-y-3">
        <label className="flex flex-col items-center justify-center bg-white rounded-2xl border-2 border-dashed border-orange/50 hover:border-orange p-10 cursor-pointer transition-colors">
          <div className="w-20 h-20 rounded-full bg-orange/10 flex items-center justify-center mb-4">
            <Camera className="w-10 h-10 text-orange" />
          </div>
          <p className="font-heading font-semibold text-navy text-lg">Tap to add photos</p>
          <p className="text-sm text-muted-foreground mt-1">
            Take {min}-{max} photos for best results
          </p>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={handleSelect}
          />
        </label>
        {error && (
          <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-xl p-3">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {previews.map((src, i) => (
          <div
            key={i}
            className="relative w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-white border"
          >
            <img src={src} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => handleRemove(i)}
              aria-label={`Remove photo ${i + 1}`}
              className="absolute top-1 right-1 bg-black/65 text-white rounded-full p-0.5 hover:bg-black/85"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {!atCapacity && (
          <label className="w-20 h-20 flex-shrink-0 rounded-lg border-2 border-dashed border-orange/50 hover:border-orange flex flex-col items-center justify-center text-orange cursor-pointer">
            <ImagePlus className="w-6 h-6" />
            <span className="text-[10px] font-medium mt-0.5">Add</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={handleSelect}
            />
          </label>
        )}
      </div>
      <p className="text-xs text-muted-foreground text-center">
        {count}/{max} photos &middot; Minimum {min} required
      </p>
      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
