/**
 * The Terms/Privacy version a signup is recorded as accepting.
 *
 * Lives here rather than inside the signup page because there is now more than
 * one way to create an account: the password form and the Google OAuth
 * callback. Two copies of this constant would drift, and the drift would be
 * invisible until someone tried to prove what a given user actually agreed to.
 *
 * 2026-08-05: Terms section 6 was rewritten from the retired deposit model to
 * the full-payment model actually in use — held funds, the 10% buyer and seller
 * fees, binary dispute resolution, and the fact that a released payout cannot
 * be reversed automatically. Signups record acceptance of THAT, not the
 * deposit-era text.
 *
 * There is still no re-acceptance flow, so users who signed up before this date
 * carry the old version string and have never seen the current terms.
 */
export const TERMS_VERSION = "2026-08-05";
