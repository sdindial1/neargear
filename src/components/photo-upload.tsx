"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import { MAX_PHOTOS, validatePhotos } from "@/lib/photo-upload";

export interface PhotoUploadProps {
  photos: File[];
  onPhotosChange: (photos: File[]) => void;
  max?: number;
  min?: number;
}

const HIDDEN_INPUT_STYLE: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
  opacity: 0,
};

export function PhotoUpload({
  photos,
  onPhotosChange,
  max = MAX_PHOTOS,
  min = 2,
}: PhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const urls = photos.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  const openPicker = () => {
    inputRef.current?.click();
  };

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (incoming.length === 0) return;

    const { valid, errors } = validatePhotos(incoming, photos.length);
    for (const err of errors) toast.error(err, { duration: 4000 });
    if (!valid.length) return;

    setPendingCount((p) => p + valid.length);
    onPhotosChange([...photos, ...valid]);
    setTimeout(
      () => setPendingCount((p) => Math.max(0, p - valid.length)),
      500,
    );
  };

  const handleRemove = (idx: number) => {
    onPhotosChange(photos.filter((_, i) => i !== idx));
  };

  const count = photos.length;
  const atCapacity = count >= max;
  const counterClass = atCapacity
    ? "text-orange font-semibold"
    : count >= 8
      ? "text-orange"
      : "text-muted-foreground";
  const counterText = atCapacity
    ? "Max photos reached"
    : `${count}/${max} photos · Minimum ${min} required`;

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
        multiple
        onChange={handleSelect}
        style={HIDDEN_INPUT_STYLE}
        aria-hidden="true"
        tabIndex={-1}
      />

      {count === 0 ? (
        <button
          type="button"
          onClick={openPicker}
          className="w-full flex flex-col items-center justify-center bg-white rounded-2xl border-2 border-dashed border-orange/50 hover:border-orange p-10 transition-colors"
        >
          <div className="w-20 h-20 rounded-full bg-orange/10 flex items-center justify-center mb-4">
            <Camera className="w-10 h-10 text-orange" />
          </div>
          <p className="font-heading font-semibold text-navy text-lg">
            Tap to add photos
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Take {min}-{max} photos · more photos = better analysis
          </p>
        </button>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {previews.map((src, i) => {
              const isPending = i >= count - pendingCount;
              return (
                <div
                  key={i}
                  className="relative w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-white border"
                >
                  <img
                    src={src}
                    alt={`Photo ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                  {isPending && (
                    <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 text-white animate-spin" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemove(i)}
                    aria-label={`Remove photo ${i + 1}`}
                    className="absolute top-1 right-1 bg-black/65 text-white rounded-full p-0.5 hover:bg-black/85"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
            {!atCapacity && (
              <button
                type="button"
                onClick={openPicker}
                className="w-20 h-20 flex-shrink-0 rounded-lg border-2 border-dashed border-orange/50 hover:border-orange flex flex-col items-center justify-center text-orange"
              >
                <ImagePlus className="w-6 h-6" />
                <span className="text-[10px] font-medium mt-0.5">Add</span>
              </button>
            )}
          </div>
          <p className={`text-xs text-center ${counterClass}`}>{counterText}</p>
        </>
      )}
    </div>
  );
}
