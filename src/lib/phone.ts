/**
 * Pretty-print a US phone as "(555) 555-5555" while the user types.
 * Strips a leading 1, drops non-digits, caps at 10.
 */
export function formatPhone(input: string): string {
  const digits = input.replace(/\D/g, "").replace(/^1/, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length < 4) return `(${digits}`;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** Returns just the 10 digits (no formatting, no country code). */
export function phoneDigits(input: string): string {
  return input.replace(/\D/g, "").replace(/^1/, "").slice(0, 10);
}

/** True iff the input has exactly 10 digits (US number). */
export function isValidUSPhone(input: string): boolean {
  return phoneDigits(input).length === 10;
}

/** Convert "(555) 555-5555" → "+15555555555" for Twilio. Empty in → null. */
export function toE164(input: string): string | null {
  const d = phoneDigits(input);
  return d.length === 10 ? `+1${d}` : null;
}
