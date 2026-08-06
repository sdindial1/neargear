"use client";

import { useState } from "react";
import Link from "next/link";
import s from "../giveaway.module.css";

/**
 * /giveaway/free-entry — the free alternate method of entry.
 *
 * Official Rules §4.2 sends people here. It must work logged out: no account,
 * no listing, no purchase. Client-side validation is a courtesy only — the
 * route re-checks everything, including the Texas ZIP rule and the one-per-day
 * limit, because nothing arriving from a browser can be trusted.
 */

type Status = "idle" | "submitting" | "done";

export default function FreeEntryPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [zip, setZip] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  /** Set when the server says they've already entered today — a softer state
   *  than an error, because nothing went wrong; they're just done for today. */
  const [alreadyEntered, setAlreadyEntered] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setAlreadyEntered(false);
    setStatus("submitting");

    try {
      const res = await fetch("/api/giveaway/free-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email, zip }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };

      if (!res.ok) {
        if (body.error === "already_entered_today") {
          setAlreadyEntered(true);
          setStatus("idle");
          return;
        }
        setError(body.message || "Something went wrong. Please try again.");
        setStatus("idle");
        return;
      }

      setStatus("done");
    } catch {
      setError("Network error. Please check your connection and try again.");
      setStatus("idle");
    }
  };

  return (
    <div className={s.page}>
      <nav className={s.nav}>
        <Link href="/giveaway" className={`${s.logo} ${s.display}`}>
          Near<span className={s.g}>Gear</span>
        </Link>
        <Link href="/auth/signup" className={s.ctaSm}>
          List Your Gear
        </Link>
      </nav>

      <main className={s.doc}>
        <Link href="/giveaway" className={s.docBack}>
          &larr; Back to the giveaway
        </Link>

        {status === "done" ? (
          <div className={s.success}>
            <div className={s.successMark}>You&rsquo;re entered</div>
            <p className={s.prose}>
              Your free entry is in for today. It has exactly the same chance of
              winning as an entry earned by listing gear.
            </p>
            <p className={s.hint} style={{ marginTop: 16 }}>
              You can enter again tomorrow — one free entry per person per day.
              We&rsquo;ll email the winner after the drawing.
            </p>
            <div style={{ marginTop: 32 }}>
              <Link href="/auth/signup" className={s.btn}>
                Want more entries? List gear &rarr;
              </Link>
            </div>
            <p className={s.hint} style={{ marginTop: 18 }}>
              Listing is optional — it just earns one entry per item.
            </p>
          </div>
        ) : (
          <>
            <article className={s.prose}>
              <h1>Free Entry</h1>
              <p>
                No purchase, no account, and no listing required. Fill this in
                and you&rsquo;re entered in the $500 bat drawing with exactly
                the same chance of winning as anyone who listed gear.
              </p>
              <p>
                Open to Texas residents 18 and over. One free entry per person
                per day. Full terms in the{" "}
                <Link href="/giveaway/rules">official rules</Link>.
              </p>
            </article>

            {alreadyEntered && (
              <div className={s.notice} style={{ marginTop: 22 }}>
                You&rsquo;ve already entered today. Come back tomorrow for
                another free entry — your entry from today is safely in the
                drawing.
              </div>
            )}

            <form className={s.form} onSubmit={submit} noValidate>
              <div className={s.row}>
                <div className={s.field}>
                  <label htmlFor="firstName">First name</label>
                  <input
                    id="firstName"
                    name="firstName"
                    autoComplete="given-name"
                    required
                    maxLength={60}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div className={s.field}>
                  <label htmlFor="lastName">Last name</label>
                  <input
                    id="lastName"
                    name="lastName"
                    autoComplete="family-name"
                    required
                    maxLength={60}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>

              <div className={s.field}>
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <p className={s.hint}>
                  This is how we&rsquo;d reach you if you win.
                </p>
              </div>

              <div className={s.field}>
                <label htmlFor="zip">Texas ZIP code</label>
                <input
                  id="zip"
                  name="zip"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  required
                  maxLength={5}
                  pattern="\d{5}"
                  value={zip}
                  onChange={(e) =>
                    setZip(e.target.value.replace(/\D/g, "").slice(0, 5))
                  }
                />
                <p className={s.hint}>
                  This giveaway is open to Texas residents only.
                </p>
              </div>

              {error && <div className={s.error}>{error}</div>}

              <div>
                <button
                  type="submit"
                  className={s.btn}
                  disabled={status === "submitting"}
                >
                  {status === "submitting" ? "Entering…" : "Enter for free →"}
                </button>
              </div>

              <p className={s.hint}>
                By entering you agree to the{" "}
                <Link href="/giveaway/rules">official rules</Link> and our{" "}
                <Link href="/privacy">privacy policy</Link>. We use this
                information to run the drawing.
              </p>
            </form>
          </>
        )}
      </main>

      <footer className={s.footer}>
        <div className={s.legal}>
          NO PURCHASE NECESSARY. Open to Texas residents 18+. Void where
          prohibited. Prize ARV $500. Sponsor: NearGear LLC, Keller, TX. See{" "}
          <Link href="/giveaway/rules">official rules</Link>.
        </div>
        <div style={{ marginTop: 10 }}>&copy; 2026 NearGear LLC.</div>
      </footer>
    </div>
  );
}
