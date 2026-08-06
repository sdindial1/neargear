import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import {
  GIVEAWAY_GOAL,
  PROMOTION_END_LABEL,
  scoreboard,
} from "@/lib/giveaway";
import s from "./giveaway.module.css";

/**
 * /giveaway — the $500 Bat Giveaway landing page.
 *
 * The scoreboard is LIVE: it counts active listings platform-wide, matching
 * Official Rules §3(a) ("500 total active listings"). Read on the server so the
 * number is correct in the HTML — a client fetch would flash a placeholder, and
 * this figure is the page's whole credibility.
 *
 * Revalidated every 5 minutes. Listings do not appear fast enough to justify
 * realtime, and a cached page absorbs ad traffic without hitting the database
 * on every view.
 *
 * NOTE ON THE CLIENT: this deliberately does NOT use createServerSupabaseClient.
 * That helper reads cookies, and reading cookies opts a route out of static
 * rendering entirely — `revalidate` would be silently ignored and every ad
 * click would hit the database. The count is public data (active listings are
 * world-readable under RLS), so a plain anon client with no cookie access keeps
 * the page cacheable.
 */
export const revalidate = 300;

export default async function GiveawayPage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Head-only count: no rows transferred, just the total.
  const { count } = await supabase
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  const board = scoreboard(count ?? 0);

  return (
    <div className={s.page}>
      <nav className={s.nav}>
        <Link href="/" className={`${s.logo} ${s.display}`}>
          Near<span className={s.g}>Gear</span>
        </Link>
        <Link href="/auth/signup" className={s.ctaSm}>
          List Your Gear
        </Link>
      </nav>

      {/* HERO */}
      <header className={s.hero}>
        <div className={`${s.heroInner} ${s.wrap}`}>
          <div className={s.eyebrow}>NearGear Giveaway</div>
          <h1 className={`${s.heroTitle} ${s.display}`}>
            Win A<span className={s.amt}>$500</span>
            <span className={s.bat}>Bat</span>
          </h1>
          <p className={s.pick}>
            Winner&rsquo;s choice: <b>Easton Ghost</b> or <b>The Dub</b>.
          </p>
          <Link href="/auth/signup" className={`${s.btn} ${s.btnBig}`}>
            Start Listing &rarr;
          </Link>
          <div className={s.free}>
            Every item you list is one entry. No purchase necessary &mdash;{" "}
            <Link href="/giveaway/free-entry">enter free without listing</Link>.
          </div>
        </div>
      </header>

      {/* SCOREBOARD — live */}
      <div className={s.boardShell}>
        <div className={s.wrap}>
          <div className={s.board}>
            <div className={s.boardLabel}>Listings on NearGear</div>
            <div className={s.boardNums}>
              <span className={s.now}>{board.count}</span>
              <span className={s.of}>of</span>
              <span className={s.goal}>{GIVEAWAY_GOAL}</span>
            </div>

            {board.closed ? (
              /* Rules §3(a): the Promotion ends the moment the target is hit. */
              <div className={s.closed}>
                <div className={s.closedBadge}>
                  Drawing closed &mdash; winner being selected
                </div>
                <p className={s.closedNote}>
                  We reached {GIVEAWAY_GOAL} listings. The winner is being drawn
                  at random from all eligible entries and will be notified by
                  email. See the{" "}
                  <Link href="/giveaway/rules">official rules</Link> for how the
                  drawing works.
                </p>
              </div>
            ) : (
              <>
                <div
                  className={s.meter}
                  role="progressbar"
                  aria-valuenow={board.count}
                  aria-valuemin={0}
                  aria-valuemax={GIVEAWAY_GOAL}
                  aria-label="Listings toward the drawing"
                >
                  <i className={s.meterFill} style={{ width: `${board.pct}%` }} />
                </div>
                <div className={s.boardFoot}>
                  <span>
                    <b>{board.toGo}</b> listings to go
                  </span>
                  <span>
                    Drawing at {GIVEAWAY_GOAL} listings &mdash; or{" "}
                    <b>{PROMOTION_END_LABEL.replace(", 2026", "")}</b>, whichever
                    comes first
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <section className={s.section}>
        <div className={s.wrap}>
          <h2 className={`${s.sectionTitle} ${s.display}`}>How It Works</h2>
          <p className={s.sub}>
            One listing, one entry. The more gear you post, the more chances you
            have.
          </p>
          <div className={s.steps}>
            <div className={s.step}>
              <div className={s.stepN}>1</div>
              <h3>Make an account</h3>
              <p>Free, takes a minute. You&rsquo;re a NearGear seller.</p>
            </div>
            <div className={s.step}>
              <div className={s.stepN}>2</div>
              <h3>List your gear</h3>
              <p>
                Bats, gloves, cleats, helmets &mdash; whatever your kids
                outgrew. Snap a photo, set a price.
              </p>
            </div>
            <div className={s.step}>
              <div className={s.stepN}>3</div>
              <h3>You&rsquo;re entered</h3>
              <p>
                Each item you list counts as one entry. You don&rsquo;t have to
                sell anything to win.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ENTRY EQUATION */}
      <section className={s.entrybar}>
        <div className={s.wrap}>
          <div className={s.bigEq}>
            1 Listing <span className={s.o}>=</span> 1 Entry
          </div>
          <p>No limit. List ten items, get ten entries.</p>
        </div>
      </section>

      {/* WHY */}
      <section className={s.section} id="why">
        <div className={s.wrap}>
          <h2 className={`${s.sectionTitle} ${s.display}`}>
            Why List On NearGear
          </h2>
          <p className={s.sub}>
            Beyond the bat &mdash; NearGear is where DFW sports families buy and
            sell gear locally.
          </p>
          <div className={s.why}>
            <div className={s.card}>
              <h4>Free to list</h4>
              <p>
                No upfront cost. You only pay a small fee when your gear
                actually sells.
              </p>
            </div>
            <div className={s.card}>
              <h4>Local and safe</h4>
              <p>
                Buyers are DFW sports families. You meet at a verified safe zone
                close to home.
              </p>
            </div>
            <div className={s.card}>
              <h4>Payment held until handoff</h4>
              <p>
                Buyers pay up front and we hold it. Nobody drives anywhere on a
                maybe.
              </p>
            </div>
            <div className={s.card}>
              <h4>Clear the garage</h4>
              <p>
                Turn the cleats and bats your kids outgrew into cash instead of
                clutter.
              </p>
            </div>
          </div>
          <div style={{ textAlign: "center", marginTop: 44 }}>
            <Link href="/auth/signup" className={s.btn}>
              Create Your Account &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className={s.section}>
        <div className={s.wrap}>
          <h2 className={`${s.sectionTitle} ${s.display}`}>Questions</h2>
          <p className={s.sub}>
            The short version. Full terms in the{" "}
            <Link href="/giveaway/rules">official rules</Link>.
          </p>
          <div className={s.faq}>
            <details>
              <summary>How do I get an entry?</summary>
              <p>
                Create a free NearGear account and list an item. Each item you
                list counts as one entry, and there&rsquo;s no limit &mdash;
                list more, get more entries.
              </p>
            </details>
            <details>
              <summary>Do I have to sell something to win?</summary>
              <p>
                No. You only have to <em>list</em> gear. Completing a sale
                isn&rsquo;t required.
              </p>
            </details>
            <details>
              <summary>Can I enter without listing anything?</summary>
              <p>
                Yes. Fill out the{" "}
                <Link href="/giveaway/free-entry">free entry form</Link> &mdash;
                no account, no listing, no purchase. One free entry per person
                per day, and it has exactly the same chance of winning as a
                listing entry.
              </p>
            </details>
            <details>
              <summary>When&rsquo;s the drawing?</summary>
              <p>
                When NearGear reaches {GIVEAWAY_GOAL} listings, or on{" "}
                {PROMOTION_END_LABEL} &mdash; whichever happens first. The
                counter at the top of this page shows where we are.
              </p>
            </details>
            <details>
              <summary>What bat does the winner get?</summary>
              <p>
                Your choice of bat up to $500 in value &mdash; the Easton Ghost
                or The Dub, subject to availability of size and model.
              </p>
            </details>
            <details>
              <summary>Who can enter?</summary>
              <p>
                Texas residents who are 18 or older. Full eligibility details
                are in the <Link href="/giveaway/rules">official rules</Link>.
              </p>
            </details>
            <details>
              <summary>What counts as a real listing?</summary>
              <p>
                Genuine youth sports gear you own and intend to sell, with a
                clear photo, an accurate description, and a fair asking price.
                Junk or duplicate listings posted just to farm entries
                don&rsquo;t count and can disqualify your other entries.
              </p>
            </details>
          </div>
        </div>
      </section>

      {/* FINAL */}
      <section className={s.final}>
        <div className={s.wrap}>
          <h2 className={`${s.finalTitle} ${s.display}`}>
            List Your Gear.
            <br />
            Win The <span className={s.amtSm}>$500</span> Bat.
          </h2>
          <Link href="/auth/signup" className={`${s.btn} ${s.btnBig}`}>
            Start Listing &rarr;
          </Link>
          <div className={s.free}>
            No purchase necessary.{" "}
            <Link href="/giveaway/free-entry">Free entry available</Link> &middot;{" "}
            <Link href="/giveaway/rules">Official rules</Link>
          </div>
        </div>
      </section>

      <footer className={s.footer}>
        <div className={`${s.logo} ${s.display}`}>
          Near<span className={s.g}>Gear</span>
        </div>
        <div>near-gear.com &nbsp;&middot;&nbsp; DFW youth sports gear, local.</div>
        <div className={s.legal}>
          NO PURCHASE NECESSARY. Open to Texas residents 18+. Void where
          prohibited. Ends at {GIVEAWAY_GOAL} listings or 11:59 p.m. CT on{" "}
          {PROMOTION_END_LABEL}, whichever occurs first. Prize ARV $500. Sponsor:
          NearGear LLC, Keller, TX. See{" "}
          <Link href="/giveaway/rules">official rules</Link>. This promotion is
          not sponsored, endorsed, or administered by Meta, Easton, or any bat
          manufacturer.
        </div>
        <div style={{ marginTop: 10 }}>&copy; 2026 NearGear LLC.</div>
      </footer>
    </div>
  );
}
