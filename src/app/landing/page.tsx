"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, ChevronDown, MapPin, Tag } from "lucide-react";
import { AceCharacter } from "@/components/ace/ace-character";

const SPORTS = [
  "Baseball",
  "Softball",
  "Soccer",
  "Football",
  "Basketball",
  "Volleyball",
  "Lacrosse",
  "Hockey",
  "Tennis",
  "Golf",
  "Track",
  "Swimming",
  "Gymnastics",
  "Wrestling",
];

const STEPS = [
  {
    n: "01",
    title: "Snap",
    Icon: Camera,
    body:
      "Take 2-5 photos of your gear. AI identifies the item, grades condition, and suggests a fair price in seconds.",
  },
  {
    n: "02",
    title: "List",
    Icon: Tag,
    body:
      "Your listing goes live in under 2 minutes with clean photos, AI pricing, and smart size matching for buyers.",
  },
  {
    n: "03",
    title: "Meet",
    Icon: MapPin,
    body:
      "Connect with a local buyer at one of 30+ verified NearGear Safe Zones across DFW. Deposit included.",
  },
];

const ACE_BULLETS = [
  { text: "Prices your gear from photos instantly", standout: false },
  { text: "Matches gear sizes to your kid's age", standout: false },
  { text: "Answers buyer questions automatically", standout: false },
  { text: "No tire-kickers. Ever.", standout: true },
];

interface Stats {
  activeListings: number;
  safeZones: number;
  foundingTotal: number;
  foundingClaimed: number;
}

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [stats, setStats] = useState<Stats>({
    activeListings: 0,
    safeZones: 30,
    foundingTotal: 15,
    foundingClaimed: 0,
  });
  const heroBgRef = useRef<HTMLDivElement>(null);

  // Navbar transparent → solid past 80px.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Subtle parallax on hero blur orbs.
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY * 0.3;
        if (heroBgRef.current) {
          heroBgRef.current.style.transform = `translateY(${y}px)`;
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Reveal-on-scroll for any element with the .lp-reveal class.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("lp-visible");
            // Stat counters fire when their host section enters view.
            const counters = entry.target.querySelectorAll<HTMLElement>(
              "[data-count-to]",
            );
            counters.forEach((el) => {
              if (el.dataset.counted === "true") return;
              el.dataset.counted = "true";
              const target = Number(el.dataset.countTo ?? "0");
              const suffix = el.dataset.countSuffix ?? "";
              const duration = 1200;
              const start = performance.now();
              const tick = (now: number) => {
                const t = Math.min(1, (now - start) / duration);
                // ease-out cubic
                const eased = 1 - Math.pow(1 - t, 3);
                const value = Math.floor(eased * target);
                el.textContent = value.toLocaleString() + (t === 1 ? suffix : "");
                if (t < 1) requestAnimationFrame(tick);
              };
              requestAnimationFrame(tick);
            });
          }
        });
      },
      { threshold: 0.15 },
    );
    document
      .querySelectorAll(".lp-reveal")
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // Live stats from /api/stats. Falls back silently to defaults.
  useEffect(() => {
    let alive = true;
    fetch("/api/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Stats | null) => {
        if (!alive || !data) return;
        setStats((prev) => ({ ...prev, ...data }));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="lp-root">
      <style>{LANDING_CSS}</style>

      {/* ============== NAV ============== */}
      <nav className={`lp-nav ${scrolled ? "lp-nav-solid" : ""}`}>
        <div className="lp-nav-inner">
          <Link href="/landing" className="lp-wordmark" aria-label="NearGear">
            <span className="lp-w-near">Near</span>
            <span className="lp-w-gear">Gear</span>
          </Link>
          <div className="lp-nav-links">
            <Link href="/browse" className="lp-nav-link">
              Marketplace
            </Link>
            <Link href="/sell" className="lp-nav-link lp-nav-hide-mobile">
              Sell Your Gear
            </Link>
            <Link href="/auth/login" className="lp-nav-link">
              Sign In
            </Link>
          </div>
        </div>
      </nav>

      {/* ============== HERO ============== */}
      <section className="lp-hero">
        <div ref={heroBgRef} className="lp-hero-bg" aria-hidden>
          <span className="lp-orb lp-orb-1" />
          <span className="lp-orb lp-orb-2" />
          <span className="lp-orb lp-orb-3" />
          <span className="lp-orb lp-orb-4" />
          <span className="lp-grain" />
        </div>

        <div className="lp-hero-content">
          <p className="lp-label lp-reveal">DFW Youth Sports Marketplace</p>
          <h1 className="lp-hero-headline lp-reveal lp-stagger-1">
            Buy &amp; Sell
            <br />
            Sports Gear
            <br />
            Locally.
          </h1>
          <p className="lp-hero-sub lp-reveal lp-stagger-2">
            AI-powered. Parent-to-parent.
            <br />
            Free to list. Only pay when you sell.
          </p>
          <div className="lp-cta-row lp-reveal lp-stagger-3">
            <Link href="/browse" className="lp-btn lp-btn-primary">
              Browse Marketplace →
            </Link>
            <Link href="/sell" className="lp-btn lp-btn-ghost">
              Start Selling Free
            </Link>
          </div>
        </div>

        <div className="lp-scroll-cue" aria-hidden>
          <span className="lp-scroll-cue-text">Scroll to Explore</span>
          <ChevronDown className="lp-scroll-cue-arrow" />
        </div>
      </section>

      {/* ============== PROBLEM ============== */}
      <section className="lp-section lp-section-cream lp-problem">
        <div className="lp-container lp-grid-2">
          <div className="lp-reveal">
            <div
              className="lp-mega-stat"
              data-count-to="1200"
              data-count-suffix="+"
            >
              0
            </div>
          </div>
          <div className="lp-reveal lp-stagger-1">
            <p className="lp-label lp-label-navy">The Reality</p>
            <h2 className="lp-section-headline lp-headline-navy">
              Every season.
              <br />
              Per kid.
              <br />
              Gone.
            </h2>
            <p className="lp-body lp-body-navy">
              The average DFW sports family spends over $1,200 per child per
              year on gear. Most gets outgrown in a single season. NearGear
              gives you a smarter way.
            </p>
          </div>
        </div>
      </section>

      {/* ============== HOW IT WORKS ============== */}
      <section className="lp-section lp-section-navy lp-hiw">
        <div className="lp-container">
          <p className="lp-label lp-center lp-reveal">How It Works</p>
          <h2 className="lp-section-headline lp-center lp-reveal lp-stagger-1">
            Three steps.
            <br />
            Done.
          </h2>
          <div className="lp-steps">
            {STEPS.map((s, i) => (
              <div
                key={s.n}
                className={`lp-step lp-reveal lp-stagger-${i + 1}`}
              >
                <span className="lp-step-num">{s.n}</span>
                <s.Icon className="lp-step-icon" />
                <h3 className="lp-step-title">{s.title}</h3>
                <p className="lp-step-body">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============== ACE FEATURE ============== */}
      <section className="lp-section lp-section-deep lp-ace">
        <div className="lp-container lp-grid-2">
          <div className="lp-ace-character lp-reveal">
            <div className="lp-ace-glow" aria-hidden />
            <div className="lp-ace-character-inner">
              <AceCharacter state="idle" size="lg" />
            </div>
          </div>
          <div className="lp-reveal lp-stagger-1">
            <p className="lp-label">Meet Ace</p>
            <h2 className="lp-section-headline lp-headline-white">
              Your AI
              <br />
              Deal
              <br />
              Broker.
            </h2>
            <ul className="lp-ace-list">
              {ACE_BULLETS.map((b, i) => (
                <li
                  key={b.text}
                  className={`lp-ace-bullet lp-reveal lp-stagger-${i + 1} ${
                    b.standout ? "lp-ace-bullet-standout" : ""
                  }`}
                >
                  <span className="lp-ace-dot">•</span>
                  <span>{b.text}</span>
                </li>
              ))}
            </ul>
            <p className="lp-ace-note">
              Ace handles pre-purchase questions so you only hear from serious
              buyers.
            </p>
          </div>
        </div>
      </section>

      {/* ============== DIFFERENTIATORS ============== */}

      <section className="lp-section lp-section-cream lp-diff">
        <div className="lp-container lp-grid-2">
          <div className="lp-reveal">
            <p className="lp-label lp-label-navy">No More Ghosting</p>
            <h2 className="lp-section-headline lp-headline-navy">
              Deposits mean
              <br />
              buyers show up.
            </h2>
            <p className="lp-body lp-body-navy">
              Every meetup request requires a deposit. No more wasted trips
              across town. No more last-minute cancellations. Real buyers
              only.
            </p>
          </div>
          <div className="lp-diff-art" aria-hidden>
            <span className="lp-diff-shape" />
          </div>
        </div>
      </section>

      <section className="lp-section lp-section-navy lp-diff lp-diff-center">
        <div className="lp-container lp-narrow">
          <p className="lp-label lp-center lp-reveal">No More Tire-Kickers</p>
          <h2 className="lp-section-headline lp-headline-white lp-center lp-reveal lp-stagger-1">
            Ace handles
            <br />
            the questions.
            <br />
            You get real
            <br />
            buyers.
          </h2>
          <p className="lp-body lp-body-muted lp-center lp-reveal lp-stagger-2">
            Ace answers sizing, pricing, and condition questions
            automatically. You only hear from buyers who&apos;ve already
            committed. Just like a real estate agent — but for gear.
          </p>
        </div>
      </section>

      <section className="lp-section lp-section-cream lp-diff">
        <div className="lp-container lp-grid-2">
          <div className="lp-reveal">
            <p className="lp-label lp-label-navy">No More Sketchy Meetups</p>
            <h2 className="lp-section-headline lp-headline-navy">
              30+ verified
              <br />
              safe zones
              <br />
              across DFW.
            </h2>
            <p className="lp-body lp-body-navy">
              Academy Sports, Dick&apos;s Sporting Goods, YMCAs, recreation
              centers, and libraries across DFW. Always public. Always
              well-lit. Always safe.
            </p>
          </div>
          <div className="lp-diff-art" aria-hidden>
            <span className="lp-diff-shape lp-diff-shape-alt" />
          </div>
        </div>
      </section>

      {/* ============== SPORTS GRID ============== */}
      <section className="lp-section lp-section-mid lp-sports">
        <div className="lp-container">
          <h2 className="lp-section-headline lp-headline-white lp-center lp-reveal">
            All Your Sports.
          </h2>
          <div className="lp-sports-row lp-reveal lp-stagger-1">
            {SPORTS.map((s) => (
              <span key={s} className="lp-sport-pill">
                {s}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ============== SOCIAL PROOF ============== */}
      <section className="lp-section lp-section-warm lp-proof">
        <div className="lp-container">
          <div className="lp-counters lp-reveal">
            <div className="lp-counter">
              <div
                className="lp-counter-num"
                data-count-to={String(stats.safeZones)}
                data-count-suffix="+"
              >
                0
              </div>
              <div className="lp-counter-label">Safe Zones Across DFW</div>
            </div>
            <div className="lp-counter">
              <div
                className="lp-counter-num"
                data-count-to={String(stats.activeListings)}
              >
                0
              </div>
              <div className="lp-counter-label">Active Listings</div>
            </div>
            <div className="lp-counter">
              <div
                className="lp-counter-num"
                data-count-to={String(stats.foundingTotal)}
              >
                0
              </div>
              <div className="lp-counter-label">Founding Family Spots</div>
            </div>
          </div>

          <div className="lp-founding lp-reveal lp-stagger-1">
            <p className="lp-label">⭐ Founding Family</p>
            <h3 className="lp-founding-headline">
              Zero platform fees. Forever.
            </h3>
            <p className="lp-founding-body">
              Only 15 DFW families will receive founding member status — zero
              fees on every sale, for life.
            </p>
            <Link href="/founding" className="lp-btn lp-btn-primary">
              Claim Your Spot →
            </Link>
          </div>
        </div>
      </section>

      {/* ============== FINAL CTA ============== */}
      <section className="lp-section lp-section-deep lp-finale">
        <div className="lp-finale-bg" aria-hidden>
          <span className="lp-orb lp-orb-1 lp-orb-strong" />
          <span className="lp-orb lp-orb-2 lp-orb-strong" />
          <span className="lp-orb lp-orb-3 lp-orb-strong" />
        </div>
        <div className="lp-container lp-finale-inner">
          <div className="lp-reveal lp-finale-ace">
            <div className="lp-ace-glow" aria-hidden />
            <div className="lp-ace-character-inner">
              <AceCharacter state="idle" size="lg" />
            </div>
          </div>
          <h2 className="lp-finale-headline lp-reveal lp-stagger-1">
            Ready to
            <br />
            Swap?
          </h2>
          <p className="lp-finale-sub lp-reveal lp-stagger-2">
            Join DFW families buying and selling youth sports gear the smarter
            way.
          </p>
          <div className="lp-cta-row lp-reveal lp-stagger-3">
            <Link href="/browse" className="lp-btn lp-btn-white">
              Browse the Marketplace →
            </Link>
            <Link href="/sell" className="lp-btn lp-btn-outline-white">
              List Your Gear Free
            </Link>
          </div>
        </div>
      </section>

      {/* ============== FOOTER ============== */}
      <footer className="lp-footer">
        <div className="lp-container lp-footer-inner">
          <div className="lp-footer-row">
            <Link href="/landing" className="lp-wordmark lp-wordmark-lg">
              <span className="lp-w-near">Near</span>
              <span className="lp-w-gear">Gear</span>
            </Link>
            <div className="lp-footer-links">
              <Link href="/browse" className="lp-footer-link">
                Marketplace
              </Link>
              <Link href="/sell" className="lp-footer-link">
                Sell
              </Link>
              <Link href="/auth/login" className="lp-footer-link">
                Sign In
              </Link>
              <a
                href="mailto:support@near-gear.com"
                className="lp-footer-link"
              >
                Support
              </a>
            </div>
          </div>
          <div className="lp-footer-row lp-footer-row-bottom">
            <span>© 2026 NearGear. DFW, Texas.</span>
            <span>Privacy · Terms</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// =====================================================================
// Landing-only CSS. Inlined as a string + <style> tag because these
// styles, custom properties, and animations are scoped to /landing
// and shouldn't leak into the rest of the app.
// =====================================================================
const LANDING_CSS = `
.lp-root {
  --lp-navy-deep: #071520;
  --lp-navy-primary: #0d2438;
  --lp-navy-mid: #1a3a52;
  --lp-navy-steel: #2d5a7a;
  --lp-orange: #ff6b35;
  --lp-orange-light: #ff8c5a;
  --lp-orange-glow: rgba(255, 107, 53, 0.15);
  --lp-orange-deep: #e55a28;
  --lp-cream: #f5f4f0;
  --lp-warm-white: #faf8f5;
  --lp-text-muted: #7a9ab5;
  --lp-text-light: #a8c4d8;

  --lp-font-display: var(--font-barlow-condensed), "Barlow Condensed",
    system-ui, sans-serif;
  --lp-font-body: var(--font-barlow), "Barlow", system-ui, sans-serif;

  background: var(--lp-navy-deep);
  color: #fff;
  font-family: var(--lp-font-body);
  width: 100%;
  overflow-x: hidden;
}

/* -------- Reveal -------- */
.lp-reveal {
  opacity: 0;
  transform: translateY(40px);
  transition:
    opacity 0.7s ease,
    transform 0.7s ease;
}
.lp-reveal.lp-visible {
  opacity: 1;
  transform: translateY(0);
}
.lp-stagger-1 { transition-delay: 0.1s; }
.lp-stagger-2 { transition-delay: 0.2s; }
.lp-stagger-3 { transition-delay: 0.3s; }
.lp-stagger-4 { transition-delay: 0.4s; }

@media (prefers-reduced-motion: reduce) {
  .lp-reveal {
    opacity: 1;
    transform: none;
    transition: none;
  }
}

/* -------- Layout primitives -------- */
.lp-section {
  position: relative;
  padding: 96px 0;
}
@media (min-width: 768px) {
  .lp-section {
    padding: 120px 0;
  }
}
.lp-section-cream { background: var(--lp-cream); color: var(--lp-navy-primary); }
.lp-section-navy { background: var(--lp-navy-primary); color: #fff; }
.lp-section-deep { background: var(--lp-navy-deep); color: #fff; }
.lp-section-mid { background: var(--lp-navy-mid); color: #fff; }
.lp-section-warm { background: var(--lp-warm-white); color: var(--lp-navy-primary); }

.lp-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
}
@media (min-width: 768px) {
  .lp-container { padding: 0 48px; }
}
.lp-narrow { max-width: 760px; }

.lp-grid-2 {
  display: grid;
  gap: 48px;
  align-items: center;
}
@media (min-width: 900px) {
  .lp-grid-2 {
    grid-template-columns: 1fr 1fr;
    gap: 80px;
  }
}

.lp-center { text-align: center; }

/* -------- Typography primitives -------- */
.lp-label {
  font-family: var(--lp-font-display);
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--lp-orange);
  margin: 0 0 16px;
}
.lp-label-navy { color: var(--lp-navy-primary); }

.lp-section-headline {
  font-family: var(--lp-font-display);
  font-weight: 900;
  font-size: clamp(40px, 8vw, 96px);
  line-height: 0.9;
  letter-spacing: -0.01em;
  text-transform: uppercase;
  margin: 0 0 24px;
  color: #fff;
}
.lp-headline-navy { color: var(--lp-navy-primary); }
.lp-headline-white { color: #fff; }

.lp-body {
  font-size: 18px;
  line-height: 1.7;
  color: var(--lp-text-muted);
  margin: 0;
  max-width: 540px;
}
.lp-body-navy { color: #2d4a63; }
.lp-body-muted { color: var(--lp-text-muted); }
.lp-center .lp-body, .lp-body.lp-center { margin-left: auto; margin-right: auto; }

/* -------- Buttons -------- */
.lp-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-family: var(--lp-font-display);
  font-weight: 700;
  font-size: 16px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 16px 32px;
  border-radius: 8px;
  border: 2px solid transparent;
  cursor: pointer;
  transition:
    background 0.2s ease,
    transform 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
  text-decoration: none;
}
.lp-btn-primary {
  background: var(--lp-orange);
  color: #fff;
}
.lp-btn-primary:hover {
  background: var(--lp-orange-light);
  transform: translateY(-2px);
}
.lp-btn-ghost {
  background: transparent;
  border-color: var(--lp-orange);
  color: var(--lp-orange);
}
.lp-btn-ghost:hover {
  background: rgba(255, 107, 53, 0.1);
  transform: translateY(-2px);
}
.lp-btn-white {
  background: #fff;
  color: var(--lp-navy-deep);
  font-size: 18px;
  padding: 18px 40px;
}
.lp-btn-white:hover { background: var(--lp-cream); }
.lp-btn-outline-white {
  background: transparent;
  border-color: rgba(255, 255, 255, 0.3);
  color: #fff;
  font-size: 18px;
  padding: 18px 40px;
}
.lp-btn-outline-white:hover {
  border-color: #fff;
  background: rgba(255, 255, 255, 0.05);
}

.lp-cta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 24px;
}
.lp-section .lp-cta-row { margin-top: 32px; }
.lp-center .lp-cta-row { justify-content: center; }

/* -------- Nav -------- */
.lp-nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 50;
  background: transparent;
  transition: background 0.3s ease, backdrop-filter 0.3s ease, border-color 0.3s ease;
  border-bottom: 1px solid transparent;
}
.lp-nav-solid {
  background: rgba(7, 21, 32, 0.95);
  backdrop-filter: saturate(140%) blur(8px);
  -webkit-backdrop-filter: saturate(140%) blur(8px);
  border-bottom-color: rgba(255, 107, 53, 0.12);
}
.lp-nav-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
@media (min-width: 768px) {
  .lp-nav-inner { padding: 20px 40px; }
}
.lp-wordmark {
  font-family: var(--lp-font-display);
  font-weight: 700;
  font-size: 24px;
  letter-spacing: -0.01em;
  text-decoration: none;
}
.lp-wordmark-lg { font-size: 32px; }
.lp-w-near { color: #fff; }
.lp-w-gear { color: var(--lp-orange); }

.lp-nav-links {
  display: flex;
  align-items: center;
  gap: 20px;
}
@media (min-width: 768px) {
  .lp-nav-links { gap: 28px; }
}
.lp-nav-link {
  font-family: var(--lp-font-body);
  font-weight: 500;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.85);
  text-decoration: none;
  transition: color 0.2s ease;
}
.lp-nav-link:hover { color: var(--lp-orange-light); }
@media (max-width: 600px) {
  .lp-nav-hide-mobile { display: none; }
}

/* -------- Hero -------- */
.lp-hero {
  position: relative;
  min-height: 100vh;
  background: var(--lp-navy-deep);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 120px 24px 80px;
}
.lp-hero-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  will-change: transform;
}
.lp-orb {
  position: absolute;
  border-radius: 50%;
  background: var(--lp-orange);
  filter: blur(120px);
  opacity: 0.08;
  animation: lp-float 26s ease-in-out infinite;
}
.lp-orb-1 { width: 600px; height: 600px; top: -120px; left: -180px; animation-delay: 0s; }
.lp-orb-2 { width: 500px; height: 500px; top: 30%; right: -180px; animation-delay: -8s; opacity: 0.07; }
.lp-orb-3 { width: 720px; height: 720px; bottom: -240px; left: 20%; animation-delay: -16s; opacity: 0.06; }
.lp-orb-4 { width: 420px; height: 420px; top: 60%; left: 10%; animation-delay: -22s; opacity: 0.05; }
.lp-orb-strong { opacity: 0.14; }
.lp-grain {
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.45'/></svg>");
  opacity: 0.03;
  mix-blend-mode: overlay;
}

@keyframes lp-float {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(40px, -30px); }
}

.lp-hero-content {
  position: relative;
  z-index: 2;
  text-align: center;
  max-width: 900px;
}
.lp-hero-headline {
  font-family: var(--lp-font-display);
  font-weight: 900;
  font-size: clamp(56px, 12vw, 140px);
  line-height: 0.9;
  letter-spacing: -0.02em;
  text-transform: uppercase;
  color: #fff;
  margin: 0 0 24px;
}
.lp-hero-sub {
  font-family: var(--lp-font-body);
  font-size: 18px;
  line-height: 1.6;
  color: var(--lp-text-muted);
  margin: 0 auto 32px;
  max-width: 480px;
}

.lp-scroll-cue {
  position: absolute;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--lp-text-muted);
  z-index: 2;
}
.lp-scroll-cue-text {
  font-family: var(--lp-font-display);
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
.lp-scroll-cue-arrow {
  width: 18px;
  height: 18px;
  color: var(--lp-orange);
  animation: lp-bounce 1.6s ease-in-out infinite;
}
@keyframes lp-bounce {
  0%, 100% { transform: translateY(0); opacity: 0.7; }
  50% { transform: translateY(6px); opacity: 1; }
}

/* -------- Problem -------- */
.lp-mega-stat {
  font-family: var(--lp-font-display);
  font-weight: 900;
  font-size: clamp(96px, 14vw, 160px);
  line-height: 0.9;
  color: var(--lp-orange-deep);
  letter-spacing: -0.02em;
  margin: 0;
}
.lp-mega-stat::before { content: "$"; }

/* -------- How It Works -------- */
.lp-steps {
  margin-top: 64px;
  display: grid;
  gap: 40px;
}
@media (min-width: 900px) {
  .lp-steps {
    grid-template-columns: 1fr 1fr 1fr;
    gap: 24px;
  }
}
.lp-step {
  position: relative;
  padding: 0 0 0 4px;
}
@media (min-width: 900px) {
  .lp-step + .lp-step {
    border-left: 1px solid var(--lp-navy-steel);
    padding-left: 32px;
  }
}
.lp-step-num {
  display: block;
  font-family: var(--lp-font-display);
  font-weight: 900;
  font-size: 80px;
  line-height: 0.9;
  color: var(--lp-orange);
  margin-bottom: 8px;
}
.lp-step-icon {
  width: 32px;
  height: 32px;
  color: #fff;
  margin-bottom: 16px;
  stroke-width: 1.5;
}
.lp-step-title {
  font-family: var(--lp-font-display);
  font-weight: 700;
  font-size: 24px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #fff;
  margin: 0 0 12px;
}
.lp-step-body {
  font-family: var(--lp-font-body);
  font-size: 16px;
  line-height: 1.6;
  color: var(--lp-text-muted);
  margin: 0;
  max-width: 360px;
}

/* -------- Ace Feature -------- */
.lp-ace { padding: 120px 0 140px; }
.lp-ace-character {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 320px;
}
.lp-ace-glow {
  position: absolute;
  width: 320px;
  height: 320px;
  background: radial-gradient(
    circle,
    rgba(255, 107, 53, 0.2) 0%,
    transparent 70%
  );
  pointer-events: none;
}
.lp-ace-character-inner {
  position: relative;
  z-index: 2;
}

.lp-ace-list {
  list-style: none;
  margin: 24px 0 16px;
  padding: 0;
  display: grid;
  gap: 12px;
}
.lp-ace-bullet {
  display: flex;
  gap: 12px;
  font-family: var(--lp-font-body);
  font-weight: 500;
  font-size: 17px;
  line-height: 1.4;
  color: var(--lp-text-light);
}
.lp-ace-dot { color: var(--lp-orange); flex-shrink: 0; line-height: 1.4; }
.lp-ace-bullet-standout {
  font-size: 20px;
  font-weight: 700;
  color: var(--lp-orange);
}
.lp-ace-note {
  font-family: var(--lp-font-body);
  font-size: 14px;
  font-style: italic;
  color: var(--lp-text-muted);
  margin: 12px 0 0;
}

/* -------- Differentiators -------- */
.lp-diff { min-height: 80vh; display: flex; align-items: center; }
.lp-diff-center .lp-container { text-align: center; }
.lp-diff-art {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
}
.lp-diff-shape {
  width: 320px;
  height: 320px;
  border-radius: 50%;
  background: var(--lp-orange);
  opacity: 0.1;
  filter: blur(2px);
}
.lp-diff-shape-alt {
  background: var(--lp-orange);
  opacity: 0.12;
  border-radius: 32%;
  transform: rotate(8deg);
}

/* -------- Sports grid -------- */
.lp-sports { padding: 80px 0; }
.lp-sports-row {
  margin-top: 48px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
}
@media (max-width: 700px) {
  .lp-sports-row {
    flex-wrap: nowrap;
    justify-content: flex-start;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    padding: 0 24px;
    margin-left: -24px;
    margin-right: -24px;
  }
  .lp-sports-row::-webkit-scrollbar { display: none; }
}
.lp-sport-pill {
  display: inline-block;
  white-space: nowrap;
  border: 1.5px solid rgba(255, 107, 53, 0.4);
  color: var(--lp-text-light);
  font-family: var(--lp-font-display);
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 10px 20px;
  border-radius: 100px;
  transition: all 0.2s ease;
  cursor: default;
}
.lp-sport-pill:hover {
  border-color: var(--lp-orange);
  color: #fff;
  background: rgba(255, 107, 53, 0.1);
}

/* -------- Social proof -------- */
.lp-proof { padding: 120px 0; }
.lp-counters {
  display: grid;
  grid-template-columns: 1fr;
  gap: 32px;
  text-align: center;
  margin-bottom: 64px;
}
@media (min-width: 700px) {
  .lp-counters { grid-template-columns: 1fr 1fr 1fr; }
}
.lp-counter-num {
  font-family: var(--lp-font-display);
  font-weight: 900;
  font-size: 80px;
  line-height: 0.9;
  color: var(--lp-navy-primary);
  font-variant-numeric: tabular-nums;
}
.lp-counter-label {
  font-family: var(--lp-font-body);
  font-weight: 500;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--lp-text-muted);
  margin-top: 8px;
}
.lp-founding {
  background: var(--lp-navy-primary);
  border-radius: 16px;
  padding: 32px 24px;
  max-width: 600px;
  margin: 0 auto;
  text-align: center;
}
@media (min-width: 700px) {
  .lp-founding { padding: 40px; }
}
.lp-founding-headline {
  font-family: var(--lp-font-display);
  font-weight: 700;
  font-size: 32px;
  color: #fff;
  margin: 8px 0 12px;
  text-transform: none;
  line-height: 1.1;
}
.lp-founding-body {
  font-family: var(--lp-font-body);
  font-size: 16px;
  color: var(--lp-text-muted);
  margin: 0 0 24px;
  line-height: 1.6;
}

/* -------- Finale -------- */
.lp-finale {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  overflow: hidden;
}
.lp-finale-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.lp-finale-inner {
  position: relative;
  z-index: 2;
  text-align: center;
}
.lp-finale-ace {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  margin: 0 auto 24px;
  width: 240px;
  height: 240px;
}
.lp-finale-headline {
  font-family: var(--lp-font-display);
  font-weight: 900;
  font-size: clamp(56px, 12vw, 140px);
  line-height: 0.9;
  letter-spacing: -0.02em;
  text-transform: uppercase;
  color: #fff;
  margin: 0 0 24px;
}
.lp-finale-sub {
  font-family: var(--lp-font-body);
  font-size: 18px;
  color: var(--lp-text-muted);
  margin: 0 auto 32px;
  max-width: 520px;
  line-height: 1.6;
}
.lp-finale .lp-cta-row { justify-content: center; }

/* -------- Footer -------- */
.lp-footer {
  background: #040e17;
  padding: 60px 0 40px;
  border-top: 1px solid rgba(255, 107, 53, 0.2);
  color: var(--lp-text-muted);
}
.lp-footer-inner {
  display: flex;
  flex-direction: column;
  gap: 32px;
}
.lp-footer-row {
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
}
@media (min-width: 700px) {
  .lp-footer-row {
    flex-direction: row;
    align-items: center;
  }
}
.lp-footer-row-bottom {
  font-family: var(--lp-font-body);
  font-size: 13px;
  border-top: 1px solid rgba(122, 154, 181, 0.15);
  padding-top: 24px;
}
.lp-footer-links {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
}
.lp-footer-link {
  font-family: var(--lp-font-body);
  font-size: 13px;
  color: var(--lp-text-muted);
  text-decoration: none;
  transition: color 0.2s ease;
}
.lp-footer-link:hover { color: var(--lp-orange-light); }
`;
