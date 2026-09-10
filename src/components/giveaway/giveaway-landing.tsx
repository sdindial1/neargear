"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { trackStandard, reportTrackResult } from "@/lib/meta-pixel";
import {
  markListingCtaClick,
  recordGiveawayEvent,
  recordGiveawayPageView,
} from "@/lib/giveaway-events";
import {
  GIVEAWAY_GOAL,
  PROMOTION_END_LABEL,
  isPlausibleEmail,
} from "@/lib/giveaway";
import s from "@/app/giveaway/landing.module.css";

/**
 * The rebuilt /giveaway landing page.
 *
 * WHAT CHANGED AND WHY. The old page's only real ask was "START LISTING",
 * which is a ten-minute physical chore — photograph the gear, write a
 * description, set a price — put in front of a visitor who arrived mid-scroll
 * from an Instagram Reel with no intent at all. Engagement was above average
 * and conversion was bottom-35%, which is what that mismatch looks like in a
 * dashboard. The listing ask has not been removed; it has been moved to after
 * a free entry, where the visitor has already committed to something.
 *
 * THE NUMBER IN THE HEADLINE IS THE ENTRY POOL, NOT THE LISTING COUNTER.
 * The old scoreboard read "60 of 500", which is active listings platform-wide.
 * 46 of those 60 predate the Promotion and earn no entry under Rules 4.1, and
 * 48 belong to Sponsor-controlled demo, seed and founder accounts that Rules 2
 * excludes. The eligible pool behind that 60 was nine. Stating the honest
 * smaller number is both the truthful thing and the persuasive one: a visitor
 * deciding whether to spend ten seconds cares how many people they are up
 * against, and nine is a genuinely good answer.
 *
 * NO ODDS RATIO IS STATED. Rules 7 defines odds as depending on the total
 * entries received, which is not known until the Entry Deadline. "About a 1 in
 * 9 shot" would be a claim about a final figure that does not exist yet and
 * that eight more weeks of entries will falsify.
 *
 * THE FORM IS TWO STEPS ON ONE SCREEN. Rules 4.2 requires first name, last
 * name, email and a Texas ZIP; the fold asks for the email alone because four
 * fields at the top of a cold landing page is the friction this rebuild exists
 * to remove. Tapping submit expands the same card in place — no navigation, no
 * second page — and asks for the rest against a commitment already made. Both
 * steps post to the same handler /giveaway/free-entry has always used.
 */

type Step = "email" | "details" | "done";

/**
 * Licensed stock photography, Pexels, cleared for commercial use.
 *
 * BOTH ARE BELOW THE FOLD AND BOTH ARE LAZY. The hero is typographic on
 * purpose. Neither of these files is in the repo yet, so both render behind an
 * onError guard that hides the container rather than leaving a broken-image
 * icon on a page a live campaign is buying traffic for — dropping the files at
 * these paths is the entire change.
 */
const BENCH_PHOTO = "/images/gear-on-bench.jpg";
const HELMET_PHOTO = "/images/helmet-on-grass.jpg";

export interface GiveawayLandingProps {
  /**
   * Eligible entries currently in the drawing, or null when the count could
   * not be read. Null renders a headline with no number rather than a zero —
   * "no entries yet" and "we could not reach the database" are different
   * statements and only one of them is a reason to enter.
   */
  entries: number | null;
  /** Rules 3(a): the Promotion ends the moment 500 active listings is hit. */
  closed: boolean;
}

export function GiveawayLanding({ entries, closed }: GiveawayLandingProps) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [zip, setZip] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  /** The server says they already entered today. Nothing went wrong — they
   *  are simply done until tomorrow, so this is softer than an error. */
  const [alreadyEntered, setAlreadyEntered] = useState(false);
  /** Hides an image container rather than showing a broken-image icon. */
  const [benchFailed, setBenchFailed] = useState(false);
  const [helmetFailed, setHelmetFailed] = useState(false);

  /**
   * The landing view, reported to the pixel as its own custom event.
   *
   * The database side of this step is already handled by PageViewLogger in the
   * root layout, which is where it belongs — a view counter wired into one
   * route stops working silently the day that route is refactored, which is
   * exactly what this file just did to it.
   *
   * Ref-guarded because React StrictMode double-invokes effects in
   * development, and a view counted twice is a conversion rate halved.
   */
  const viewReported = useRef(false);
  useEffect(() => {
    if (viewReported.current) return;
    viewReported.current = true;
    recordGiveawayPageView();
  }, []);

  /** Step one is validation only. Nothing is sent until the rules-required
   *  fields are in hand, so a half-filled entry is never banked. */
  const submitEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!isPlausibleEmail(email.trim().toLowerCase())) {
      setError("Please enter a valid email address.");
      return;
    }
    setStep("details");
  };

  const submitEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setAlreadyEntered(false);
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
        if (body.error === "already_entered_today") {
          setAlreadyEntered(true);
          setSubmitting(false);
          return;
        }
        setError(body.message || "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }

      // Our own record first, the pixel second. Meta under-reported
      // ListingCreated for roughly 22 listings before anyone noticed, so the
      // database is the source of truth for whether this rebuild worked and
      // the pixel is the thing that has to agree with it.
      //
      // Only a genuinely new entry counts. The already_entered_today path
      // returns above without reaching here, which is correct — a repeat
      // visitor is the same person, and counting them again would inflate the
      // conversion rate the campaign is optimised against.
      recordGiveawayEvent("entry_submitted");
      reportTrackResult("Lead", trackStandard("Lead"));
      setSubmitting(false);
      setStep("done");
    } catch {
      setError("Network error. Please check your connection and try again.");
      setSubmitting(false);
    }
  };

  /**
   * The listing ask, finally. Marks the tap before the navigation so the
   * signup it leads to can be attributed back to this moment — the number that
   * settles whether asking after commitment beats asking before it.
   */
  const onListingCtaClick = () => {
    markListingCtaClick();
    recordGiveawayEvent("listing_cta_clicked");
  };

  // ---- Headline ------------------------------------------------------------
  // Every branch here has to be true of the data as read. The plural, the
  // zero case and the unreadable case are separate sentences rather than one
  // sentence with a number interpolated into it, because "0 entries are in the
  // drawing" and "no one has entered yet" are not the same claim.
  let headline: React.ReactNode;
  let subhead: string;

  if (closed) {
    headline = <>Entries are closed.</>;
    subhead = `We reached ${GIVEAWAY_GOAL} listings. The winner is being drawn at random from all eligible entries and will be notified by email.`;
  } else if (entries == null) {
    headline = (
      <>
        One entry wins a <span className={s.count}>$500</span> bat.
      </>
    );
    subhead = "Entering is free and takes about ten seconds. No account, no listing, nothing to buy.";
  } else if (entries === 0) {
    headline = <>Nobody has entered yet. One person wins a $500 bat.</>;
    subhead = "You would be the first name in the drawing. Free, and about ten seconds.";
  } else {
    headline = (
      <>
        Only <span className={s.count}>{entries}</span>{" "}
        {entries === 1 ? "entry is" : "entries are"} in the drawing right now.
      </>
    );
    subhead = "One of them wins a $500 bat. Entering is free and takes about ten seconds.";
  }

  return (
    <div className={s.page}>
      {/* ================================================== ABOVE THE FOLD == */}
      <section className={s.fold}>
        <Link href="/" className={s.brand}>
          Near<span className={s.g}>Gear</span>
        </Link>

        <div className={s.spacerTop} />

        <h1 className={s.headline}>{headline}</h1>
        <p className={s.subhead}>{subhead}</p>

        <p className={s.prizeLine}>
          The prize is one bat, <strong>winner&rsquo;s choice</strong> of the
          Easton Ghost or The Dub. Approximate retail value $500.
        </p>

        {closed ? (
          <p className={s.notice}>
            The drawing is closed. See the{" "}
            <Link href="/giveaway/rules">official rules</Link> for how the
            winner is selected.
          </p>
        ) : step === "done" ? (
          <div className={s.success}>
            <div className={s.successMark}>
              <CheckMark /> You&rsquo;re entered.
            </div>
            <p className={s.successBody}>
              Your free entry is in. It has exactly the same chance of winning
              as an entry earned by listing gear. If you win, we email you at{" "}
              {email.trim().toLowerCase()}.
            </p>

            {!helmetFailed && (
              <div className={s.successPhoto}>
                <Image
                  src={HELMET_PHOTO}
                  alt="Baseball helmet and balls on a field."
                  fill
                  sizes="(max-width: 560px) 100vw, 520px"
                  loading="lazy"
                  onError={() => setHelmetFailed(true)}
                />
              </div>
            )}

            <div className={s.upsell}>
              <p className={s.upsellTitle}>Want more entries?</p>
              <p className={s.upsellBody}>
                Every item you list on NearGear is another one. No limit — list
                ten things, get ten more entries. Bats, gloves, cleats, helmets,
                whatever your kids outgrew.
              </p>
              <Link
                href="/auth/signup?redirect=/sell"
                className={s.upsellCta}
                onClick={onListingCtaClick}
              >
                List gear for more entries &rarr;
              </Link>
              <p className={s.upsellOptional}>
                Completely optional. Your free entry is already in.
              </p>
            </div>
          </div>
        ) : step === "email" ? (
          <form className={s.form} onSubmit={submitEmail} noValidate>
            <div className={s.emailRow}>
              <input
                className={s.input}
                type="email"
                name="email"
                inputMode="email"
                autoComplete="email"
                enterKeyHint="go"
                maxLength={254}
                placeholder="Your email"
                aria-label="Your email address"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
              />
              <button type="submit" className={s.submit}>
                Enter &rarr;
              </button>
            </div>
            {error && <p className={s.error}>{error}</p>}
          </form>
        ) : (
          <form className={s.form} onSubmit={submitEntry} noValidate>
            <div className={s.stepTwo}>
              <p className={s.stepTwoLead}>Almost in. The rules need three things.</p>
              <div className={s.nameRow}>
                <input
                  className={s.input}
                  name="firstName"
                  autoComplete="given-name"
                  maxLength={60}
                  placeholder="First name"
                  aria-label="First name"
                  value={firstName}
                  onChange={(ev) => setFirstName(ev.target.value)}
                />
                <input
                  className={s.input}
                  name="lastName"
                  autoComplete="family-name"
                  maxLength={60}
                  placeholder="Last name"
                  aria-label="Last name"
                  value={lastName}
                  onChange={(ev) => setLastName(ev.target.value)}
                />
              </div>
              <div className={s.zipRow}>
                <input
                  className={s.input}
                  name="zip"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  maxLength={5}
                  placeholder="Texas ZIP code"
                  aria-label="Texas ZIP code"
                  value={zip}
                  onChange={(ev) =>
                    setZip(ev.target.value.replace(/\D/g, "").slice(0, 5))
                  }
                />
              </div>

              {alreadyEntered && (
                <p className={s.notice}>
                  You&rsquo;ve already entered today. Come back tomorrow for
                  another free entry — today&rsquo;s is safely in the drawing.
                </p>
              )}
              {error && <p className={s.error}>{error}</p>}

              <button
                type="submit"
                className={`${s.submit} ${s.submitWide}`}
                disabled={submitting}
              >
                {submitting ? "Entering…" : "Confirm my entry →"}
              </button>

              <p className={s.emailEcho}>
                Entering as {email.trim().toLowerCase()}.{" "}
                <button
                  type="button"
                  className={s.linkish}
                  onClick={() => {
                    setStep("email");
                    setError("");
                    setAlreadyEntered(false);
                  }}
                >
                  Change
                </button>
              </p>
            </div>
          </form>
        )}

        <p className={s.trust}>
          NearGear LLC, Keller, TX. Entries close {PROMOTION_END_LABEL} or at{" "}
          {GIVEAWAY_GOAL} listings, whichever comes first. The winner is drawn
          within seven days and notified by email.
        </p>

        <p className={s.foldLegal}>
          No purchase necessary — this form is the free entry. Open to Texas
          residents 18+. <Link href="/giveaway/rules">Official rules</Link>.
        </p>

        <div className={s.spacerBottom} />
      </section>

      {/* ================================================== BELOW THE FOLD == */}
      <section className={s.below}>
        <details className={s.accordion}>
          <summary>How it works</summary>
          <div className={s.accordionBody}>
            <ol className={s.steps}>
              <li>
                <strong>Enter free.</strong> The form above is the whole thing.
                One free entry per person per day, and you can come back
                tomorrow for another.
              </li>
              <li>
                <strong>Or list gear for more entries.</strong> Create a free
                account and post an item of youth sports equipment. Each item
                you list earns one more entry, with no limit.
              </li>
              <li>
                <strong>We draw one winner.</strong> At random, from every
                eligible entry, within seven days of the entry deadline. Free
                entries and listing entries have exactly the same chance.
              </li>
            </ol>
          </div>
        </details>

        <details className={s.accordion}>
          <summary>Why list on NearGear</summary>
          <div className={s.accordionBody}>
            {!benchFailed && (
              <div className={s.band}>
                <Image
                  src={BENCH_PHOTO}
                  alt="Youth baseball gear on a bench."
                  fill
                  sizes="(max-width: 560px) 100vw, 520px"
                  loading="lazy"
                  onError={() => setBenchFailed(true)}
                />
              </div>
            )}
            <p>
              <strong>Free to list.</strong> No upfront cost. You only pay a
              small fee when your gear actually sells.
            </p>
            <p>
              <strong>Local and safe.</strong> Buyers are DFW sports families,
              and you meet at a verified safe zone close to home.
            </p>
            <p>
              <strong>Payment held until handoff.</strong> Buyers pay up front
              and we hold it, so nobody drives anywhere on a maybe.
            </p>
            <p>
              <strong>Clear the garage.</strong> Turn the cleats and bats your
              kids outgrew into cash instead of clutter.
            </p>
          </div>
        </details>

        <details className={s.accordion}>
          <summary>Questions</summary>
          <div className={s.accordionBody}>
            <p className={s.subQ}>Do I have to buy anything?</p>
            <p className={s.subA}>
              No. No purchase or payment of any kind is necessary to enter or
              win, and a purchase will not improve your chances.
            </p>

            <p className={s.subQ}>Do I need an account?</p>
            <p className={s.subA}>
              Not for the free entry above. You only need an account if you want
              extra entries by listing gear. The{" "}
              <Link href="/giveaway/free-entry">standalone free entry form</Link>{" "}
              works the same way.
            </p>

            <p className={s.subQ}>How many times can I enter?</p>
            <p className={s.subA}>
              One free entry per person per calendar day, every day of the
              promotion. Listing entries have no limit — each item you list is
              one more entry.
            </p>

            <p className={s.subQ}>Who can enter?</p>
            <p className={s.subA}>
              Legal residents of Texas who are 18 or older. Sponsor employees
              and their households are not eligible. Void where prohibited.
            </p>

            <p className={s.subQ}>What exactly is the prize?</p>
            <p className={s.subA}>
              One bat of the winner&rsquo;s choice, from options we offer,
              with an approximate retail value not exceeding $500. The choice
              includes at minimum the Easton Ghost and The Dub, subject to
              availability of size and model.
            </p>

            <p className={s.subQ}>When is the drawing?</p>
            <p className={s.subA}>
              Entries close on {PROMOTION_END_LABEL}, or the moment NearGear
              reaches {GIVEAWAY_GOAL} active listings — whichever happens first.
              We draw within seven days of that and notify the winner by email.
            </p>

            <p className={s.subQ}>What counts as a real listing?</p>
            <p className={s.subA}>
              Genuine youth sports gear you own and intend to sell, with a clear
              photo, an accurate description and a fair asking price. Junk or
              duplicate listings posted to farm entries do not count and can
              disqualify your other entries.
            </p>
          </div>
        </details>
      </section>

      <footer className={s.footer}>
        <div className={s.footerBrand}>
          Near<span className={s.g}>Gear</span>
        </div>
        <div className={s.copyright}>
          near-gear.com &middot; DFW youth sports gear, local.
        </div>
        <div className={s.legal}>
          NO PURCHASE NECESSARY. A purchase will not increase your chances of
          winning. Open to legal residents of Texas 18 and older. Void where
          prohibited. Free entry available above and at{" "}
          <Link href="/giveaway/free-entry">near-gear.com/giveaway/free-entry</Link>.
          Promotion ends at {GIVEAWAY_GOAL} active listings or 11:59 p.m. CT on{" "}
          {PROMOTION_END_LABEL}, whichever occurs first. One prize, approximate
          retail value $500. Sponsor: NearGear LLC, 1400 Ashmore Court, Keller,
          TX 76248. See <Link href="/giveaway/rules">official rules</Link>. This
          promotion is not sponsored, endorsed, or administered by Meta, Easton,
          or any bat manufacturer.
        </div>
        <div className={s.copyright}>&copy; 2026 NearGear LLC.</div>
      </footer>
    </div>
  );
}

/** Check mark for the success state. */
function CheckMark() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" strokeWidth="1.8" />
      <path d="M7.5 12.4l3 3 6-6.5" />
    </svg>
  );
}
