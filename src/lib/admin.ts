/**
 * Admin identity is an email allowlist, matched against the JWT email from
 * `supabase.auth.getUser()` — NOT against public.users. That distinction is
 * load-bearing: migration 020 locked SELECT on public.users to own-row only,
 * and the gate is unaffected because it never reads that table.
 *
 * Failing this check is a silent redirect("/"), so a non-allowlisted address
 * looks identical to "the page doesn't exist". The branded @near-gear.com
 * addresses are the ones actually used day to day; omitting them cost an
 * afternoon of "why can't I reach /admin".
 *
 * POST-LAUNCH: every admin change is a deploy. Fine at two people, worth
 * moving to a users column before there's a third.
 */
export const ADMIN_EMAILS: string[] = [
  "shaun.dindial@gmail.com",
  "shaun@near-gear.com",
  "amaro_02@hotmail.com",
  "amaro@near-gear.com",
];

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(email.toLowerCase());
}
