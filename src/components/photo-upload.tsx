"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Camera, ImagePlus, Loader2, X } from "lucide-react";

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export interface PhotoUploadProps {
  photos: File[];
  onPhotosChange: (photos: File[]) => void;
  max?: number;
  min?: number;
  maxBytes?: number;
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
  max = 5,
  min = 2,
  maxBytes = MAX_PHOTO_BYTES,
}: PhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    console.log(
      "[PhotoUpload] previews effect — rebuilding from",
      photos.length,
      "photos",
    );
    const urls = photos.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  const openPicker = () => {
    console.log(
      "[PhotoUpload] openPicker clicked; inputRef.current =",
      inputRef.current ? "<input mounted>" : "NULL",
    );
    inputRef.current?.click();
    console.log("[PhotoUpload] inputRef.click() called");
  };

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    console.log(
      "[PhotoUpload] onChange fired — files:",
      fileList?.length ?? 0,
    );
    const incoming = Array.from(fileList ?? []);
    e.target.value = "";

    if (incoming.length === 0) {
      console.log("[PhotoUpload] no files in event — bailing");
      return;
    }

    console.log(
      "[PhotoUpload] incoming:",
      incoming.map((f) => ({ name: f.name, size: f.size, type: f.type })),
    );
    setError("");

    const oversize = incoming.find((f) => f.size > maxBytes);
    if (oversize) {
      const mb = Math.floor(maxBytes / 1024 / 1024);
      console.log(
        "[PhotoUpload] rejecting oversize file:",
        oversize.name,
        oversize.size,
      );
      setError(`"${oversize.name}" is over ${mb}MB. Pick a smaller photo.`);
      return;
    }

    const remaining = max - photos.length;
    if (remaining <= 0) {
      console.log("[PhotoUpload] at capacity — ignoring");
      return;
    }

    const accepted = incoming.slice(0, remaining);
    console.log(
      "[PhotoUpload] accepting",
      accepted.length,
      "file(s); photos will become",
      photos.length + accepted.length,
    );
    setPendingCount((p) => p + accepted.length);
    onPhotosChange([...photos, ...accepted]);
    setTimeout(
      () => setPendingCount((p) => Math.max(0, p - accepted.length)),
      500,
    );
  };

  const handleRemove = (idx: number) => {
    onPhotosChange(photos.filter((_, i) => i !== idx));
  };

  const count = photos.length;
  const atCapacity = count >= max;

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
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
          <p className="text-xs text-muted-foreground text-center">
            {count}/{max} photos · Minimum {min} required
          </p>
        </>
      )}

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
