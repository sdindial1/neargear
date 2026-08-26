import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { safeRedirect } from "@/lib/safe-redirect";
import { TERMS_VERSION } from "@/lib/terms";
import { NextRequest, NextResponse } from "next/server";

/**
 * OAuth and email-confirmation callback.
 *
 * This is where a Google account first comes into being, and it is a SERVER
 * route — no window, no localStorage. Everything that must exist for a signup
 * to be a real NearGear account is therefore created HERE, and only the one
 * thing the server physically cannot see (client-held first-touch attribution)
 * is left to /api/auth/bootstrap on the landing page.
 *
 * Before this, the OAuth path created an auth.users row and nothing else. The
 * public.users row was only conjured later and lazily by ensurePublicUserRow()
 * the first time someone visited /sell — which meant a Google signup had no
 * profile row, no recorded terms acceptance, and was invisible to every query
 * keyed on public.users (the nudge cohort, the signups view, the admin
 * dashboard). They existed to Supabase Auth and to nothing else.
 *
 * NOT REMOVED FROM THE PIXEL SUPPRESSION LIST. This URL carries an auth code,
 * and the pixel transmits document.location.href. CompleteRegistration fires
 * after the redirect, on a page that is not suppressed.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  // Guarded: this value is interpolated into a redirect, so an absolute URL
  // here would be an open redirect off-site.
  const next = safeRedirect(searchParams.get("next"), "/marketplace");

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?error=Could not authenticate`);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/auth/login?error=Could not authenticate`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/auth/login?error=Could not authenticate`);
  }

  let isNew = false;
  const admin = createAdminSupabaseClient();
  if (admin) {
    const { data: existing } = await admin
      .from("users")
      .select("id, terms_accepted_at")
      .eq("id", user.id)
      .maybeSingle();

    if (!existing) {
      isNew = true;
      // Google's profile fields. `name` and `full_name` are both populated
      // depending on the provider and scope granted, so both are checked before
      // falling back to the address.
      const meta = (user.user_metadata ?? {}) as {
        full_name?: string;
        name?: string;
      };
      const { error: insErr } = await admin.from("users").insert({
        id: user.id,
        email: user.email,
        full_name: meta.full_name ?? meta.name ?? user.email ?? null,
        // Recorded here rather than left for a later page, because the
        // sweepstakes Official Rules are incorporated by reference and an
        // account with no recorded acceptance is a gap we would only discover
        // when it mattered. The consent itself is given at the button — see the
        // notice under "Continue with Google".
        terms_accepted_at: new Date().toISOString(),
        terms_version: TERMS_VERSION,
      });
      if (insErr) {
        console.error("[auth/callback] profile insert failed", insErr);
      }
    } else if (!existing.terms_accepted_at) {
      // Pre-existing row that never recorded acceptance (legacy rows created by
      // ensurePublicUserRow). Backfill on the way through rather than leaving a
      // permanent hole.
      await admin
        .from("users")
        .update({
          terms_accepted_at: new Date().toISOString(),
          terms_version: TERMS_VERSION,
        })
        .eq("id", user.id);
    }
  }

  // New accounts go through /welcome, which is where the client-side bootstrap
  // runs: it attaches attribution and fires CompleteRegistration. Returning
  // users go straight where they were headed.
  const target = isNew
    ? `/welcome?next=${encodeURIComponent(next)}&new=1`
    : next;
  return NextResponse.redirect(`${origin}${target}`);
}
