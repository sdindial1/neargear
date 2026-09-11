"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  markListingCtaClick,
  recordGiveawayEvent,
} from "@/lib/giveaway-events";
import s from "@/app/giveaway/landing.module.css";

/**
 * /giveaway — ported from _design/giveaway-redesign.html.
 *
 * The design file is the finished article and it wins every disagreement with
 * anything written earlier. Its markup, class names and copy are reproduced
 * here as-is; what follows is only the wiring a static mock cannot carry.
 *
 * THREE STATES, ONE PAGE, NO NAVIGATION. s1 collects the email and nothing
 * else. s1 to s2 is purely client-side — NOTHING IS WRITTEN until s2 submits,
 * so an abandoned half-entry never reaches the database and never becomes a
 * row a drawing has to account for.
 *
 * s2 posts to /api/giveaway/free-entry, the same handler /giveaway/free-entry
 * has always used and which is untouched. There is deliberately no second
 * write path: the daily limit is a unique index on that table and the Texas
 * rule is enforced in that route, and a parallel endpoint would be a second
 * place for both to be got wrong.
 *
 * ONE NAME FIELD, TWO NAME COLUMNS. The design asks for a single "Full name";
 * Rules 4.2 and the handler both want first and last separately. The split
 * happens here, on the first space. A single word cannot be split, so that is
 * refused before the request rather than bouncing off the handler's
 * name_required after the visitor has already filled in a ZIP.
 */

type Step = "s1" | "s2" | "s3";

export interface GiveawayLandingProps {
  /** True only when public/images/bat-band.jpg exists at build time. */
  bandAvailable: boolean;
}

export function GiveawayLanding({ bandAvailable }: GiveawayLandingProps) {
  const [step, setStep] = useState<Step>("s1");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [zip, setZip] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  /** The design's show(): swap the state and put the reader back at the top. */
  const show = (next: Step) => {
    setStep(next);
    window.scrollTo({ top: 0 });
  };

  /**
   * Focus follows the state change, in an effect rather than beside the
   * setState call.
   *
   * A requestAnimationFrame next to setStep can run before React has committed
   * the new `hidden` attributes, and focusing an element that is still
   * display:none silently does nothing — which is exactly what it did here
   * first time round. An effect keyed on `step` runs after the commit, so the
   * field is on screen by the time it is asked to take the cursor.
   *
   * Skipped on the first render: arriving on the page should not yank the
   * viewport to the email field or pop a keyboard open unasked.
   */
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (step === "s2") nameRef.current?.focus();
    if (step === "s1") emailRef.current?.focus();
  }, [step]);

  const submitEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    show("s2");
  };

  const submitEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
      setError("Please enter your first and last name.");
      return;
    }
    const firstName = parts[0];
    const lastName = parts.slice(1).join(" ");

    setSubmitting(true);
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
        // Every refusal the handler can return — non-Texas ZIP, malformed
        // email, missing surname, already entered today, promotion closed —
        // lands in the same slot above the ZIP row, which is where the eye
        // already is because that is where the submit button lives.
        setError(body.message || "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }

      setSubmitting(false);
      show("s3");
      recordGiveawayEvent("entry_submitted");
    } catch {
      setError("Network error. Please check your connection and try again.");
      setSubmitting(false);
    }
  };

  /** Back to s1 with the typed email still in the field. */
  const useDifferentEmail = () => {
    setError("");
    show("s1");
  };

  /**
   * The closer's "Enter free" targets #email, which is inside s1 and therefore
   * not in the layout while s2 or s3 is showing. Switch state first, then put
   * the cursor in the field — a bare anchor would scroll to nothing.
   */
  const jumpToEntry = (e: React.MouseEvent) => {
    e.preventDefault();
    show("s1");
  };

  const onListingCtaClick = () => {
    markListingCtaClick();
    recordGiveawayEvent("listing_cta_clicked");
  };

  return (
    <div className={s.page}>
      <div className={s.wrap}>
        <header className={s.pad}>
          <span className={s.mark}>
            Near<span>Gear</span>
          </span>
          <a className={s.hlink} href="#list">
            List your gear
          </a>
        </header>

        <div className={s.board}>
          <span className={s.n}>Nov 3</span>
          <span className={s.lab}>
            Entries close<b>Winner drawn in 7 days</b>
          </span>
          <span className={s.live}>$500 bat</span>
        </div>

        <div className={`${s.hero} ${s.pad}`}>
          {/* ---- s1: email only ---- */}
          <div className={s.step} id="s1" hidden={step !== "s1"}>
            <h1>
              Somebody in DFW is getting a <em>$500 bat</em>.
            </h1>
            <p className={s.sub}>
              Free to enter. No account, no purchase, about ten seconds. Then go
              back to what you were doing.
            </p>
            <form id="f1" onSubmit={submitEmail}>
              <label className={s.sr} htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                ref={emailRef}
                type="email"
                name="email"
                placeholder="you@email.com"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
              />
              <button type="submit">Enter the drawing</button>
            </form>
            <p className={s.legal}>
              No purchase necessary — this form is the free entry. Open to Texas
              residents 18+. NearGear LLC, Keller TX.{" "}
              <Link href="/giveaway/rules">Official rules</Link>.
            </p>
          </div>

          {/* ---- s2: the fields Rules 4.2 requires ---- */}
          <div className={s.step} id="s2" hidden={step !== "s2"}>
            <h1>Two more fields and you&rsquo;re in.</h1>
            <p className={s.sub}>
              The official rules need a name and a Texas ZIP to make an entry
              count.
            </p>
            <form id="f2" onSubmit={submitEntry}>
              <label className={s.sr} htmlFor="fullname">
                Full name
              </label>
              <input
                id="fullname"
                ref={nameRef}
                type="text"
                name="name"
                placeholder="First and last name"
                autoComplete="name"
                required
                maxLength={120}
                value={fullName}
                onChange={(ev) => setFullName(ev.target.value)}
              />

              {error && (
                <p className={s.err} role="alert">
                  {error}
                </p>
              )}

              <div className={s.fields}>
                <label className={s.sr} htmlFor="zip">
                  ZIP code
                </label>
                <input
                  id="zip"
                  type="text"
                  name="zip"
                  placeholder="ZIP code"
                  inputMode="numeric"
                  pattern="[0-9]{5}"
                  maxLength={5}
                  autoComplete="postal-code"
                  required
                  value={zip}
                  onChange={(ev) =>
                    setZip(ev.target.value.replace(/\D/g, "").slice(0, 5))
                  }
                />
                <button type="submit" disabled={submitting}>
                  {submitting ? "…" : "Finish"}
                </button>
              </div>
            </form>
            <button className={s.backlink} type="button" id="back" onClick={useDifferentEmail}>
              Use a different email
            </button>
            <p className={s.legal}>
              Texas residents 18+. One free entry per person per day.{" "}
              <Link href="/giveaway/rules">Official rules</Link>.
            </p>
          </div>

          {/* ---- s3: confirmed ---- */}
          <div className={s.step} id="s3" hidden={step !== "s3"}>
            <div className={s.confirm}>
              <span className={s.tick}>✓</span>
              <h1>You&rsquo;re entered.</h1>
            </div>
            <p className={s.sub}>
              We&rsquo;ll email <b id="echo">{email.trim() || "you@email.com"}</b>{" "}
              if you win. The drawing is November 3 and the winner is notified
              within seven days.
            </p>

            <div className={s.next}>
              <div className={s.eyebrow}>Want better odds</div>
              <h3>Every item you list is another entry</h3>
              <p>
                Bats, gloves, cleats, helmets — whatever your kids outgrew.
                Listing is free and takes about a minute. There&rsquo;s no cap.
              </p>
              <Link
                className={s.cta}
                href="/auth/signup?redirect=/sell"
                onClick={onListingCtaClick}
              >
                List your gear
              </Link>
              <Link className={s.alt2} href="/marketplace">
                Or see what DFW families are selling &rarr;
              </Link>
            </div>
          </div>
        </div>

        <BandSlot available={bandAvailable} />

        <section className={s.pad}>
          <div className={s.eyebrow}>The prize</div>
          <h2>One bat, winner&rsquo;s choice</h2>
          <p className={s.lede}>
            Drawn once. Shipped or handed off locally, whichever you&rsquo;d
            rather.
          </p>
          <div className={s.prize}>
            <div className={s.row}>
              <span className={s.k}>Fastpitch</span>
              <span className={s.v}>Easton Ghost</span>
            </div>
            <div className={s.row}>
              <span className={s.k}>Baseball</span>
              <span className={s.v}>The Dub</span>
            </div>
            <div className={`${s.row} ${s.stack}`}>
              <span className={s.k}>Length &amp; drop</span>
              <span className={`${s.v} ${s.spec}`}>
                Winner picks the size and drop weight that fits their kid.
              </span>
            </div>
            <div className={s.row}>
              <span className={s.k}>Approximate retail value</span>
              <span className={s.v}>$500</span>
            </div>
            <div className={`${s.row} ${s.stack}`}>
              <span className={s.k}>Entries close</span>
              <span className={`${s.v} ${s.spec}`}>
                November 3, 2026, or when NearGear reaches 500 total listings
                &mdash; whichever comes first.
              </span>
            </div>
          </div>
        </section>

        <section className={`${s.pad} ${s.alt}`}>
          <div className={s.eyebrow}>How it works</div>
          <h2>Enter free, or stack the odds</h2>
          <ol className={s.steps}>
            <li>
              <span className={s.num}>1</span>
              <div>
                <h3>Enter with your email</h3>
                <p>
                  That&rsquo;s a full entry. Nothing else required, and it
                  counts exactly the same as any other.
                </p>
              </div>
            </li>
            <li>
              <span className={s.num}>2</span>
              <div>
                <h3>List gear your kids outgrew</h3>
                <p>
                  Every item you post is one more entry. Bats, gloves, cleats,
                  helmets. Free to list.
                </p>
              </div>
            </li>
            <li>
              <span className={s.num}>3</span>
              <div>
                <h3>We draw one name</h3>
                <p>
                  Within seven days of close. Winner notified by email at the
                  address you enter.
                </p>
              </div>
            </li>
          </ol>
        </section>

        <section className={s.pad} id="list">
          <div className={s.eyebrow}>Why sell here</div>
          <h2>Built for DFW families, not shippers</h2>
          <div className={s.why}>
            <div>
              <h3>Free to list</h3>
              <p>You only pay when the item actually sells.</p>
            </div>
            <div>
              <h3>Money held</h3>
              <p>
                The buyer pays up front. We hold it until you hand the gear
                over.
              </p>
            </div>
            <div>
              <h3>Local handoff</h3>
              <p>
                Meet a family nearby at a public spot. No shipping, no boxes.
              </p>
            </div>
            <div>
              <h3>Clear the garage</h3>
              <p>Last season&rsquo;s bat becomes this season&rsquo;s registration fee.</p>
            </div>
          </div>
        </section>

        <section className={`${s.pad} ${s.alt}`} id="rules">
          <div className={s.eyebrow}>Questions</div>
          <h2>The short version</h2>
          <details>
            <summary>Do I have to list anything to win?</summary>
            <p>
              No. The email form above is a complete free entry with the same
              chance of winning as any listing entry.
            </p>
          </details>
          <details>
            <summary>How many entries can I get?</summary>
            <p>
              One free entry per person per day, plus one for every qualifying
              listing you post. There&rsquo;s no cap on listings.
            </p>
          </details>
          <details>
            <summary>What counts as a qualifying listing?</summary>
            <p>
              Real youth sports equipment you actually own and intend to sell,
              listed with a photo and a price.
            </p>
          </details>
          <details>
            <summary>Who can enter?</summary>
            <p>Texas residents 18 and over. Void where prohibited.</p>
          </details>
          <details>
            <summary>When is the drawing?</summary>
            <p>
              Within seven days of entries closing &mdash; November 3, 2026, or
              when NearGear reaches 500 total listings, whichever happens first.
            </p>
          </details>
        </section>

        <div className={`${s.closer} ${s.pad}`}>
          <h2>One bat. One winner.</h2>
          <p>
            Enter free in ten seconds. List the gear in your garage and get more
            chances.
          </p>
          <a className={s.ghost} href="#email" onClick={jumpToEntry}>
            Enter free
          </a>
        </div>

        <footer className={s.pad}>
          <div className={s.fm}>NearGear</div>
          <p>near-gear.com &middot; DFW youth sports gear, local.</p>
          <p className={s.footNote}>
            NO PURCHASE NECESSARY. Open to Texas residents 18+. Void where
            prohibited. Ends at 500 listings or 11:59 p.m. CT on November 3,
            2026, whichever occurs first. Prize ARV $500. Sponsor: NearGear LLC,
            Keller, TX. <Link href="/giveaway/rules">See official rules</Link>.
            This promotion is not sponsored, endorsed, or administered by Meta,
            Easton, or any bat manufacturer.
          </p>
          <p className={s.footNote}>&copy; 2026 NearGear LLC.</p>
        </footer>
      </div>
    </div>
  );
}

/**
 * The photo band, or nothing at all.
 *
 * Whether the file exists is decided on the server at build time and arrives
 * as a prop — see page.tsx. When it is missing the element is not rendered,
 * so there is no placeholder, no broken image and no reserved gap: the hero
 * sits directly against the prize section. Dropping the file in and
 * redeploying is the only change needed to make it appear.
 */
function BandSlot({ available }: { available: boolean }) {
  if (!available) return null;
  return (
    <div className={s.band}>
      {/* A plain img, matching the design. next/image would need width and
          height for a file that is not in the repo, and its optimiser adds
          nothing to a single above-the-prize band served from our own origin. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/bat-band.jpg"
        alt="Close-up of a youth baseball bat at a field."
      />
    </div>
  );
}
