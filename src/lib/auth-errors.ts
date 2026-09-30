/**
 * Reasons /auth/callback can send someone back to the login page.
 *
 * The callback passes a CODE, never the message: the login page renders
 * whatever it is given, and a free-text ?error= would let anyone craft a
 * near-gear.com sign-in link carrying their own words ("call this number to
 * verify your account"). An unknown code shows nothing.
 *
 * Each message says what to do next, not only what went wrong.
 */
export const AUTH_ERRORS = {
  cancelled:
    "Google sign-in was cancelled. You can try again, or sign in with email below.",
  expired: "That sign-in link expired or was already used. Please try again.",
  failed:
    "We couldn't sign you in. Please try again, or sign in with email below.",
  setup:
    "We couldn't finish setting up your account. Please try again in a moment — if it keeps happening, email support@near-gear.com.",
} as const;

export type AuthErrorCode = keyof typeof AUTH_ERRORS;

export function authErrorMessage(code: string | null): string {
  return code && Object.prototype.hasOwnProperty.call(AUTH_ERRORS, code)
    ? AUTH_ERRORS[code as AuthErrorCode]
    : "";
}
