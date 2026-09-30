import {
  compressPhoto,
  PhotoDecodeError,
  PhotoTooLargeError,
} from "@/lib/image";

export const MAX_PHOTOS = 10;
/**
 * Sanity cap on the ORIGINAL file, before compression. Not a quality limit —
 * every photo is shrunk to ~1024px before it goes anywhere. This only stops a
 * video or a raw scan being decoded into a phone's memory. It used to be 5 MB,
 * which rejected ordinary iPhone photos (8–12 MB) on the exact screen the ads
 * pay to reach.
 */
export const MAX_SOURCE_FILE_SIZE = 40 * 1024 * 1024;
export const ALLOWED_PHOTO_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

export interface PhotoValidationResult {
  valid: File[];
  errors: string[];
}

// Every message says what to DO, not only what went wrong — this toast is the
// whole of the help a seller gets on this screen.
const label = (file: File) => file.name || "This photo";

/**
 * Cap the photo count, source size and MIME type. Returns the subset of files
 * that passed plus human-readable errors. Caller decides how to surface errors
 * (we toast them). Cheap and synchronous; preparePhotos() is what callers
 * normally want.
 */
export function validatePhotos(
  files: File[],
  existingCount: number,
): PhotoValidationResult {
  const errors: string[] = [];
  const valid: File[] = [];

  if (existingCount >= MAX_PHOTOS) {
    return {
      valid,
      errors: [`Max ${MAX_PHOTOS} photos. Remove one before adding more.`],
    };
  }

  const slotsLeft = MAX_PHOTOS - existingCount;
  if (files.length > slotsLeft) {
    errors.push(
      `Too many photos. You can add ${slotsLeft} more (max ${MAX_PHOTOS}).`,
    );
  }
  const considered = files.slice(0, slotsLeft);

  for (const file of considered) {
    if (file.size > MAX_SOURCE_FILE_SIZE) {
      errors.push(
        `${label(file)} is too big to use — it may be a video or a raw file. Pick a regular photo, or take a screenshot of it and add that.`,
      );
      continue;
    }
    // An empty type is let through: some Android gallery apps report none for
    // ordinary JPEGs. Decoding is the real test, and it fails with its own
    // message below.
    if (file.type && !ALLOWED_PHOTO_TYPES.includes(file.type)) {
      errors.push(
        `${label(file)} isn't a photo format we can use. Pick a JPG, PNG or HEIC photo, or take a screenshot of it and add that.`,
      );
      continue;
    }
    valid.push(file);
  }

  return { valid, errors };
}

export function photoErrorMessage(file: File, err: unknown): string {
  if (err instanceof PhotoTooLargeError) {
    return `${label(file)} is still too large after shrinking it. Try cropping it in your Photos app, or retake it.`;
  }
  if (err instanceof PhotoDecodeError) {
    return `We couldn't open ${label(file)}. Take a screenshot of it and add the screenshot instead, or pick a different photo.`;
  }
  return `Something went wrong adding ${label(file)}. Please try adding it again.`;
}

/**
 * Validate, then compress each photo to ~1024px JPEG. Sequential on purpose:
 * decoding ten 12-megapixel photos at once is enough to get a mobile tab
 * killed. The returned files are what gets previewed, analysed and uploaded.
 */
export async function preparePhotos(
  files: File[],
  existingCount: number,
): Promise<PhotoValidationResult> {
  const { valid: candidates, errors } = validatePhotos(files, existingCount);
  const valid: File[] = [];
  for (const file of candidates) {
    try {
      valid.push(await compressPhoto(file));
    } catch (err) {
      console.error("[photos] compression failed", file.type, file.size, err);
      errors.push(photoErrorMessage(file, err));
    }
  }
  return { valid, errors };
}
