export const MAX_PHOTOS = 10;
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
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

/**
 * Cap the photo count, file size, and MIME type. Returns the subset of files
 * that passed all checks plus any human-readable errors. Caller decides how
 * to surface errors (we toast them).
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
    if (file.size > MAX_FILE_SIZE) {
      errors.push(
        `${file.name || "Photo"} is too large. Max is 5 MB per photo.`,
      );
      continue;
    }
    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      errors.push(
        `${file.name || "Photo"} is not a supported format. Use JPG, PNG, WebP, or HEIC.`,
      );
      continue;
    }
    valid.push(file);
  }

  return { valid, errors };
}
