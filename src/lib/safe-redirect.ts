/**
 * Sanitize a user-supplied post-auth redirect target.
 *
 * `?redirect=` on the login and signup pages was being passed straight into
 * router.push(), which navigates to absolute URLs — so a crafted link could
 * send someone through a genuine NearGear sign-in and then bounce them to an
 * attacker's page. On an auth screen that is a credible phishing setup, and it
 * matters more now that paid traffic points at these exact pages.
 *
 * Only same-origin PATHS are allowed through. Everything else silently falls
 * back to the caller's default rather than erroring: a bad redirect param is
 * not something a real user can act on, so the useful behaviour is to land
 * them somewhere sensible.
 *
 * Rejected, and why each one matters:
 *   https://evil.com   absolute URL, different origin
 *   //evil.com         protocol-relative; browsers resolve it as absolute
 *   /\evil.com         backslash variant of the same trick
 *   //evil.com with a control character between the slashes — browsers strip
 *                      those while parsing, so it becomes protocol-relative
 *   javascript:...     not a path at all
 */

/**
 * ASCII control characters (U+0000–U+001F and U+007F), which browsers strip
 * while parsing a URL. Built via the RegExp constructor rather than a literal
 * so this source file contains no raw control bytes of its own.
 */
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001F\\u007F]", "g");

export function safeRedirect(
  raw: string | null | undefined,
  fallback = "/marketplace",
): string {
  if (!raw) return fallback;

  // Strip the characters a browser would remove BEFORE testing the prefix —
  // otherwise the string we validate is not the string it ends up navigating
  // to, which is exactly how these guards get bypassed.
  const value = raw.replace(CONTROL_CHARS, "").trim();

  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;

  return value;
}
