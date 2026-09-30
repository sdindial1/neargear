/**
 * Every listing photo is stored and analysed at this size. Listing photos are
 * shown small, and the AI analysis, background removal and moderation have
 * always seen 1024px JPEGs — changing this changes what all three see.
 */
export const PHOTO_MAX_DIM = 1024;
export const PHOTO_QUALITY = 0.85;
/** After compression. A 1024px JPEG is normally 150–300 KB. */
export const PHOTO_TARGET_BYTES = 1024 * 1024;

export class PhotoDecodeError extends Error {}
export class PhotoTooLargeError extends Error {}

// Files compressPhoto() produced. resizeImage() hands these straight back
// instead of decoding and re-encoding a JPEG that is already the right size —
// a second 0.85 pass would only lose quality. Tracked by identity rather than
// by type or size so a raw original can never take the shortcut: re-encoding
// is also what strips EXIF, including the GPS location of the seller's home.
const compressed = new WeakSet<Blob>();

async function decode(file: Blob): Promise<HTMLImageElement> {
  // Object URL, not a data URL: a 12 MB photo as base64 is a 16 MB string
  // held in memory alongside the decoded bitmap.
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new PhotoDecodeError("Image decode failed"));
      el.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function fit(width: number, height: number, maxDim: number) {
  if (width <= maxDim && height <= maxDim) return { width, height };
  return width >= height
    ? { width: maxDim, height: Math.round((height * maxDim) / width) }
    : { width: Math.round((width * maxDim) / height), height: maxDim };
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new PhotoDecodeError("Encode failed"))),
      "image/jpeg",
      quality,
    ),
  );
}

/**
 * Shrink a photo the moment it is picked: longest edge to 1024px, re-encoded
 * as JPEG, under 1 MB. iPhones shoot 8–12 MB, and this is what lets those
 * through — the upload never carries the original.
 *
 * Throws PhotoDecodeError when the browser cannot read the file (e.g. HEIC in
 * desktop Chrome) and PhotoTooLargeError if it is somehow still over target.
 * See photoErrorMessage() in lib/photo-upload for what the user is told.
 */
export async function compressPhoto(file: File): Promise<File> {
  const img = await decode(file);
  const { width, height } = fit(img.naturalWidth, img.naturalHeight, PHOTO_MAX_DIM);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new PhotoDecodeError("No 2D canvas context");
    ctx.drawImage(img, 0, 0, width, height);

    let blob = await toJpeg(canvas, PHOTO_QUALITY);
    if (blob.size > PHOTO_TARGET_BYTES) blob = await toJpeg(canvas, 0.7);
    if (blob.size > PHOTO_TARGET_BYTES) {
      throw new PhotoTooLargeError(`Still ${blob.size} bytes after compression`);
    }

    const name = (file.name || "photo").replace(/\.[^.]*$/, "") + ".jpg";
    const out = new File([blob], name, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
    compressed.add(out);
    return out;
  } finally {
    // iOS Safari caps TOTAL canvas memory per page and does not reliably free
    // detached canvases. Ten photos in a row is enough to hit it.
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function resizeImage(
  file: File,
  maxDim = PHOTO_MAX_DIM,
  quality = PHOTO_QUALITY,
): Promise<string> {
  if (compressed.has(file) && maxDim >= PHOTO_MAX_DIM) {
    return blobToDataUrl(file);
  }

  const img = await decode(file);
  const { width, height } = fit(img.naturalWidth, img.naturalHeight, maxDim);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D canvas context");
  ctx.drawImage(img, 0, 0, width, height);
  const out = canvas.toDataURL("image/jpeg", quality);
  canvas.width = 0;
  canvas.height = 0;
  return out;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}
