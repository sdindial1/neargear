"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";

/**
 * "Continue with Google".
 *
 * WHY IT EARNS ITS PLACE: password signup depends on a confirmation email from
 * a domain whose inbox placement is still unverified. Every one of those that
 * lands in junk is a paid ad click thrown away. OAuth removes both the password
 * and that email from the critical path.
 *
 * TERMS. Inline notice rather than a checkbox: a checkbox in front of a one-tap
 * button undercuts the whole reason for adding OAuth. Inline assent is the
 * standard pattern and is generally enforceable when it is conspicuous and
 * immediately adjacent to the action — so the notice sits directly ABOVE the
 * button, not below it, and is rendered at readable weight rather than as fine
 * print.
 *
 * The Official Rules are a SEPARATE visible link, not folded into "terms".
 * They are incorporated by reference and they are the document with a $500
 * prize attached; burying them inside a bundled link is the part that would not
 * survive scrutiny. Acceptance itself is recorded server-side in /auth/callback
 * so no account can exist without one — see src/lib/terms.ts.
 *
 * `next` is carried through the provider round trip and validated by
 * safeRedirect() when the callback reads it back, so a crafted value cannot
 * turn this into an open redirect.
 */
export function GoogleAuthButton({
  next = "/marketplace",
  label = "Continue with Google",
}: {
  next?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const start = async () => {
    setBusy(true);
    setError("");
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        // Forces the account chooser. Without it, anyone on a shared family
        // computer is silently signed in as whoever used it last — which on a
        // marketplace means listing gear under someone else's name.
        queryParams: { prompt: "select_account" },
      },
    });

    // Only reached if the redirect never happened; on success the browser has
    // already left the page.
    if (oauthError) {
      setError(oauthError.message);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {/* ABOVE the button, deliberately. Assent has to be visible before the
          action, not explained after it. */}
      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        By continuing you agree to our{" "}
        <a href="/terms" className="font-medium text-navy underline">
          Terms of Service
        </a>
        ,{" "}
        <a href="/privacy" className="font-medium text-navy underline">
          Privacy Policy
        </a>{" "}
        and the{" "}
        <a href="/giveaway/rules" className="font-medium text-navy underline">
          Giveaway Official Rules
        </a>
        .
      </p>

      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="w-full min-h-[48px] inline-flex items-center justify-center gap-3 rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-navy hover:bg-gray-50 disabled:opacity-60"
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Redirecting…
          </>
        ) : (
          <>
            {/* Google's mark, inline so it works with the strict CSP and needs
                no external request. */}
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.96-1.08 7.94-2.92l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.09A12 12 0 0 0 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.29 14.28a7.2 7.2 0 0 1 0-4.56V6.63H1.28a12 12 0 0 0 0 10.74l4.01-3.09z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.23 0 12 0A12 12 0 0 0 1.28 6.63l4.01 3.09C6.23 6.86 8.88 4.75 12 4.75z"
              />
            </svg>
            {label}
          </>
        )}
      </button>

      {error && <p className="text-center text-xs text-red-700">{error}</p>}
    </div>
  );
}
