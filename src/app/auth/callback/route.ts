import * as Sentry from "@sentry/nextjs";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { safeRedirect } from "@/lib/safe-redirect";
import { TERMS_VERSION } from "@/lib/terms";
import type { AuthErrorCode } from "@/lib/auth-errors";
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
 * FAILS CLOSED. The only way out of this route that counts as a signup is a
 * redirect to /welcome?new=1, and that page fires CompleteRegistration — a
 * conversion we pay Meta against. So that redirect happens only after the
 * public.users row is PROVEN to exist: we inserted it and PostgREST said so,
 * or we read it back. Every other outcome (no service role, a failed lookup, a
 * failed insert) signs the user out and sends them to the login page with a
 * message. That is recoverable — the next Google sign-in finds no row and
 * tries again, still as a new account. A conversion reported for an account
 * that does not exist is not recoverable: Meta optimises the campaign toward it
 * and our own funnel never sees it.
 *
 * A failed lookup is NOT treated as "no row". PostgREST errors come back as a
 * null row plus an error, and reading that as "new user" would insert over an
 * existing account's id and then report a registration that never happened.
 *
 * NOT REMOVED FROM THE PIXEL SUPPRESSION LIST. This URL carries an auth code,
 * and the pixel transmits document.location.href. CompleteRegistration fires
 * after the redirect, on a page that is not suppressed.
 */

// Postgres unique_violation. Two callbacks for the same user can race (a
// double-tapped consent screen, a retried request); the loser's insert fails
// on the primary key, and the row it wanted provably exists.
const UNIQUE_VIOLATION = "23505";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  // Guarded: this value is interpolated into a redirect, so an absolute URL
  // here would be an open redirect off-site.
  const next = safeRedirect(searchParams.get("next"), "/marketplace");

  // Every failure lands on the login page with a reason the user can act on,
  // and with `redirect` preserved so a retry returns them where they started.
  // Before this the error was sent and never shown. It is a code, not text —
  // see src/lib/auth-errors.ts.
  const fail = (reason: AuthErrorCode) =>
    NextResponse.redirect(
      `${origin}/auth/login?error=${reason}&redirect=${encodeURIComponent(next)}`,
    );

  if (!code) {
    // The provider sends the user back with ?error= instead of ?code= when
    // they cancel or it refuses. Cancelling is not a fault, so say so plainly.
    const providerError = searchParams.get("error");
    if (providerError === "access_denied") {
      return fail("cancelled");
    }
    return fail("failed");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return fail("expired");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return fail("failed");
  }

  // From here on a session exists. Any failure must clear it: leaving someone
  // signed in with no profile row is exactly the half-created state this route
  // exists to prevent, and ensurePublicUserRow() would later paper over it with
  // a row carrying no terms acceptance and no attribution.
  const abort = async (stage: string, err: unknown) => {
    console.error(`[auth/callback] ${stage}`, err);
    Sentry.captureException(err instanceof Error ? err : new Error(`[auth/callback] ${stage}`), {
      tags: { route: "auth/callback", stage },
      extra: { userId: user.id, detail: err },
    });
    await supabase.auth.signOut();
    return fail("setup");
  };

  const admin = createAdminSupabaseClient();
  if (!admin) {
    return abort("no-service-role", new Error("SUPABASE_SERVICE_ROLE_KEY missing"));
  }

  const { data: existing, error: lookupErr } = await admin
    .from("users")
    .select("id, terms_accepted_at")
    .eq("id", user.id)
    .maybeSingle();
  if (lookupErr) return abort("profile-lookup", lookupErr);

  let isNew = false;

  if (!existing) {
    // Google's profile fields. `name` and `full_name` are both populated
    // depending on the provider and scope granted, so both are checked before
    // falling back to the address. city/zipcode/phone come from the password
    // signup form, which passes them as signUp metadata: this is where that
    // account's row gets created if email confirmation is ever required (the
    // browser has no session then, so RLS refuses its own insert).
    const meta = (user.user_metadata ?? {}) as {
      full_name?: string;
      name?: string;
      city?: string;
      zipcode?: string;
      phone?: string;
    };
    const { data: inserted, error: insErr } = await admin
      .from("users")
      .insert({
        id: user.id,
        email: user.email,
        full_name: meta.full_name ?? meta.name ?? user.email ?? null,
        city: meta.city || null,
        zipcode: meta.zipcode || null,
        phone: meta.phone || null,
        // Recorded here rather than left for a later page, because the
        // sweepstakes Official Rules are incorporated by reference and an
        // account with no recorded acceptance is a gap we would only discover
        // when it mattered. The consent itself is given at the button — see the
        // notice under "Continue with Google".
        terms_accepted_at: new Date().toISOString(),
        terms_version: TERMS_VERSION,
      })
      // Read back rather than trusting a null error: the row we report as a
      // registration must be one PostgREST actually returned.
      .select("id")
      .maybeSingle();

    if (insErr?.code === UNIQUE_VIOLATION) {
      // A concurrent callback created it. The row exists, but that request
      // owns the conversion — reporting it here too would double-count.
      isNew = false;
    } else if (insErr || !inserted) {
      return abort("profile-insert", insErr ?? new Error("insert returned no row"));
    } else {
      isNew = true;
    }
  } else if (!existing.terms_accepted_at) {
    // Pre-existing row that never recorded acceptance (legacy rows created by
    // ensurePublicUserRow). Backfill on the way through rather than leaving a
    // permanent hole. Not fatal — the account exists either way — but not
    // silent either.
    const { error: backfillErr } = await admin
      .from("users")
      .update({
        terms_accepted_at: new Date().toISOString(),
        terms_version: TERMS_VERSION,
      })
      .eq("id", user.id);
    if (backfillErr) {
      console.error("[auth/callback] terms backfill failed", backfillErr);
      Sentry.captureException(new Error("[auth/callback] terms backfill failed"), {
        tags: { route: "auth/callback", stage: "terms-backfill" },
        extra: { userId: user.id, detail: backfillErr },
      });
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
