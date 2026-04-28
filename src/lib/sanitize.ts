import DOMPurify from "isomorphic-dompurify";

export const LIMITS = {
  LISTING_TITLE: 100,
  LISTING_DESCRIPTION: 1000,
  MESSAGE: 500,
  ACE_MESSAGE: 500,
  REVIEW_TEXT: 500,
  CUSTOM_LOCATION: 200,
} as const;

/**
 * Strip HTML, trim whitespace, cap length. Safe for any user-supplied text
 * that we round-trip back to the UI.
 */
export function sanitizeText(input: string, maxLength = 500): string {
  if (!input) return "";
  const stripped = DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });
  return stripped.trim().slice(0, maxLength);
}
