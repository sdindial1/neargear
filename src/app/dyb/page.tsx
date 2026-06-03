import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Heart,
  MapPin,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

// ============================================================================
// /dyb  —  DYB FAMILY landing page  (STATIC DEMO ONLY)
// Audience: parents of Dragon Youth Baseball players (NOT the league board —
// the board has its own separate pitch). Pure visual page: no referral
// capture, no partner-table reads, no signup wiring. Ace is hidden on /dyb via
// src/components/ace/ace-floating.tsx (HIDE_PREFIXES).
// ============================================================================

// --- Brand palette: DYB is the host, NearGear is the guest. -----------------
// Swap colors here in one place.
//
// Official Carroll ISD Dragon Green (Pantone 348C) per the CISD brand guide.
const DYB_GREEN = "#00833E";
const DYB_GREEN_DEEP = "#00592A"; // darker shade for depth/gradients
const DYB_BLACK = "#111111";
const DYB_WHITE = "#ffffff";
// NearGear orange — ACCENT ONLY. Thin rules and arrows. NOT in the wordmark,
// not in headlines. Must never compete with the green.
const NG_ORANGE = "#ff6b35";

export const metadata: Metadata = {
  title: "NearGear × Dragon Youth Baseball — Gear Up the Next Dragon",
  description:
    "DYB families: list your kid's outgrown baseball gear, help another Southlake family gear up affordably, and give back to Dragon Youth Baseball with every sale.",
  robots: { index: false, follow: false }, // static demo — flip to index at launch
};

export default function DybFamilyPage() {
  return (
    <main
      id="dyb-top"
      style={{ backgroundColor: DYB_WHITE, color: DYB_BLACK }}
      className="font-sans"
    >
      {/* ===================== 1. HERO ===================== */}
      <section
        style={{
          background: `linear-gradient(160deg, ${DYB_GREEN} 0%, ${DYB_GREEN_DEEP} 100%)`,
          color: DYB_WHITE,
        }}
        className="px-5 pb-16 pt-10 md:px-8 md:pb-24 md:pt-14"
      >
        <div className="mx-auto max-w-3xl">
          <CoBrandLockup />

          <div
            style={{ backgroundColor: NG_ORANGE }}
            className="mt-8 h-1 w-16 rounded-full"
          />

          <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-white/75">
            For Dragon Youth Baseball families
          </p>
          <h1 className="mt-3 font-heading text-[clamp(2.6rem,9vw,5rem)] font-bold uppercase leading-[0.9]">
            Gear up
            <br />
            the next Dragon.
          </h1>
          <p className="mt-6 max-w-[50ch] text-lg leading-relaxed text-white/90 md:text-xl">
            The cleats, bats, and helmets your kid outgrew can get another
            Southlake family geared up for a fraction of retail — and a part of
            every sale goes right back to <strong>Dragon Youth Baseball</strong>.
            Clear out the garage, help a teammate, support the league.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <CtaButton primary href="#start">
              List Your Gear
            </CtaButton>
            <CtaButton href="#browse">Browse DYB Gear</CtaButton>
          </div>
        </div>
      </section>

      {/* ===================== 2. GIVE-BACK (hero-level) ===================== */}
      <section className="px-5 py-14 md:px-8 md:py-20">
        <div className="mx-auto max-w-3xl">
          <div
            style={{
              background: `linear-gradient(160deg, ${DYB_GREEN} 0%, ${DYB_GREEN_DEEP} 100%)`,
              color: DYB_WHITE,
            }}
            className="rounded-3xl p-8 md:p-12"
          >
            <Heart className="h-8 w-8" style={{ color: NG_ORANGE }} />
            <SectionLabel onDark className="mt-4">
              Every sale gives back
            </SectionLabel>
            <h2 className="mt-3 font-heading text-[clamp(1.9rem,6vw,3rem)] font-bold uppercase leading-tight">
              Every sale supports Southlake kids.
            </h2>
            <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-white/90">
              When your gear sells, part of the fee goes straight back to Dragon
              Youth Baseball — helping fund the equipment, the fields, and the
              programs that keep Southlake kids on the diamond. No fundraiser
              forms, no extra asks. Just sell what your kid outgrew, and the
              league gets a little stronger.
            </p>
          </div>
        </div>
      </section>

      {/* ===================== 3. HOW SELLING WORKS ===================== */}
      <section
        id="start"
        style={{ backgroundColor: DYB_BLACK, color: DYB_WHITE }}
        className="px-5 py-14 md:px-8 md:py-20"
      >
        <div className="mx-auto max-w-3xl">
          <SectionLabel onDark>Selling, the easy way</SectionLabel>
          <h2 className="mt-3 font-heading text-[clamp(1.9rem,6vw,3rem)] font-bold uppercase leading-tight">
            Free to list. Pays you back twice.
          </h2>
          <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-white/75">
            Free to list — you only pay a small fee when your gear actually
            sells, and part of that fee goes right back to DYB to support
            Southlake kids. No upfront cost, no catch.
          </p>

          {/* Three plain-language steps — no percentages, no jargon. */}
          <div className="mt-9 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch">
            <FlowStep
              kicker="Step 1"
              big="List it"
              sub="Snap a few photos of the gear your kid outgrew. Takes minutes, costs nothing."
            />
            <FlowArrow />
            <FlowStep
              kicker="Step 2"
              big="A Dragon grabs it"
              sub="Another DYB family nearby buys it at a great local price."
            />
            <FlowArrow />
            <FlowStep
              kicker="Step 3"
              big="Everybody wins"
              sub="You get paid, they get gear, and DYB gets a cut."
              highlight
            />
          </div>
        </div>
      </section>

      {/* ===================== 4. WHAT FAMILIES GET ===================== */}
      <section className="px-5 py-14 md:px-8 md:py-20">
        <div className="mx-auto max-w-3xl">
          <SectionLabel>Why DYB families love it</SectionLabel>
          <h2 className="mt-3 font-heading text-[clamp(1.9rem,6vw,3rem)] font-bold uppercase leading-tight">
            Made for baseball parents.
          </h2>

          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <BenefitCard
              title="Free to list"
              body="Post gear in minutes. You only pay a small fee when it actually sells — never to list."
            />
            <BenefitCard
              title="Local & safe"
              body="Trades stay inside the DYB community. Real Southlake families, verified members, safe meetups."
            />
            <BenefitCard
              title="No more tire-kickers"
              body="No lowball DMs or no-shows. Just serious local parents who need gear that fits their kid."
            />
            <BenefitCard
              title="Gear that keeps playing"
              body="Last season's cleats become another kid's first pair — kept in the community, out of the landfill."
            />
          </div>
        </div>
      </section>

      {/* ===================== 5. BUY LOCAL ===================== */}
      <section
        id="browse"
        style={{
          background: `linear-gradient(160deg, ${DYB_GREEN} 0%, ${DYB_GREEN_DEEP} 100%)`,
          color: DYB_WHITE,
        }}
        className="px-5 py-14 md:px-8 md:py-20"
      >
        <div className="mx-auto max-w-3xl">
          <SectionLabel onDark>Need gear this season?</SectionLabel>
          <h2 className="mt-3 font-heading text-[clamp(1.9rem,6vw,3rem)] font-bold uppercase leading-tight">
            Shop your own dugout first.
          </h2>
          <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-white/90">
            Cleats that&apos;ll fit by next month, bats your kid will outgrow in
            a season, helmets in great shape — from families right here in
            Southlake. A fraction of retail, and your money keeps gear moving in
            the community.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <PointCard
              icon={<ShoppingBag />}
              title="Real local deals"
              body="Quality gear from DYB families at a fraction of retail."
            />
            <PointCard
              icon={<MapPin />}
              title="Right in Southlake"
              body="Meet a few minutes away. No shipping, no strangers across the metro."
            />
            <PointCard
              icon={<ShieldCheck />}
              title="Verified & safe"
              body="Inside the DYB community. Real families, safe meetups."
            />
          </div>

          <div className="mt-9">
            <CtaButton href="#dyb-top" lightOnGreen>
              Browse DYB Gear
            </CtaButton>
          </div>
        </div>
      </section>

      {/* ===================== 6. CTA ===================== */}
      <section className="px-5 py-16 md:px-8 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <div
            aria-label="Dragon Youth Baseball logo placeholder"
            style={{ borderColor: DYB_GREEN, color: DYB_GREEN }}
            className="mx-auto grid h-14 w-14 place-items-center rounded-full border-2 border-dashed text-[10px] font-bold uppercase tracking-wide"
          >
            DYB
          </div>
          <h2 className="mt-6 font-heading text-[clamp(2rem,7vw,3.5rem)] font-bold uppercase leading-[0.95]">
            List your gear.
            <br />
            Gear up a Dragon.
          </h2>
          <p className="mx-auto mt-4 max-w-[46ch] text-lg leading-relaxed text-black/65">
            Clear out the garage, help another Southlake family, and give back to
            DYB with every sale. Free to list — start in minutes.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            {/* Static demo — non-functional placeholders (scroll to top). */}
            <CtaButton primary href="#dyb-top">
              List Your Gear
            </CtaButton>
            <CtaButton href="#dyb-top" greenOutline>
              Browse DYB Gear
            </CtaButton>
          </div>

          <p className="mt-8 text-xs leading-relaxed text-black/40">
            <NearGearWordmarkInline /> × Dragon Youth Baseball · A community gear
            marketplace for Southlake families. Coming soon to DYB.
          </p>
        </div>
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Brand lockup
// ---------------------------------------------------------------------------

// NearGear wordmark — ALL BLACK (no orange). Sits on the white lockup chip.
function NearGearWordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-heading font-bold tracking-tight ${className}`}
      style={{ color: DYB_BLACK }}
    >
      NearGear
    </span>
  );
}

// Balanced co-brand lockup: NearGear and Dragon Youth Baseball read as
// equal-weight partners on a white chip. Thin orange divider is the only
// orange. DYB mark is a placeholder until the official asset lands.
function CoBrandLockup() {
  return (
    <div className="inline-flex flex-wrap items-center gap-3 rounded-2xl bg-white px-4 py-2.5 shadow-sm sm:gap-4">
      <NearGearWordmark className="text-lg md:text-xl" />
      <span
        aria-hidden
        style={{ backgroundColor: NG_ORANGE }}
        className="h-6 w-px"
      />
      <span className="flex items-center gap-2">
        <span
          aria-label="Dragon Youth Baseball logo placeholder"
          style={{ borderColor: DYB_GREEN, color: DYB_GREEN }}
          className="grid h-8 w-8 place-items-center rounded-full border border-dashed text-[9px] font-bold uppercase tracking-wide"
        >
          DYB
        </span>
        <span
          className="font-heading text-lg font-bold tracking-tight md:text-xl"
          style={{ color: DYB_GREEN }}
        >
          Dragon Youth Baseball
        </span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small presentational helpers (kept local to this static page).
// ---------------------------------------------------------------------------

function SectionLabel({
  children,
  onDark = false,
  className = "",
}: {
  children: React.ReactNode;
  onDark?: boolean;
  className?: string;
}) {
  return (
    <p
      className={`text-xs font-bold uppercase tracking-[0.2em] ${className}`}
      style={{ color: onDark ? NG_ORANGE : DYB_GREEN }}
    >
      {children}
    </p>
  );
}

// CTA / nav button — 44px+ touch target everywhere.
function CtaButton({
  href,
  children,
  primary = false,
  lightOnGreen = false,
  greenOutline = false,
}: {
  href: string;
  children: React.ReactNode;
  primary?: boolean;
  lightOnGreen?: boolean; // solid white button for use on a green section
  greenOutline?: boolean; // green-outlined button for use on white
}) {
  const base =
    "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full px-7 text-base font-bold uppercase tracking-wide transition hover:-translate-y-0.5";

  if (primary) {
    return (
      <Link
        href={href}
        className={base}
        style={{ backgroundColor: DYB_GREEN, color: DYB_WHITE }}
      >
        {children}
        <ArrowRight className="h-4 w-4" />
      </Link>
    );
  }
  if (lightOnGreen) {
    return (
      <Link
        href={href}
        className={base}
        style={{ backgroundColor: DYB_WHITE, color: DYB_GREEN }}
      >
        {children}
        <ArrowRight className="h-4 w-4" />
      </Link>
    );
  }
  if (greenOutline) {
    return (
      <Link
        href={href}
        className={`${base} border-2`}
        style={{ borderColor: DYB_GREEN, color: DYB_GREEN }}
      >
        {children}
      </Link>
    );
  }
  // Default: outlined for use on a green/dark section.
  return (
    <Link
      href={href}
      className={`${base} border-2`}
      style={{ borderColor: "rgba(255,255,255,0.55)", color: DYB_WHITE }}
    >
      {children}
    </Link>
  );
}

function FlowStep({
  kicker,
  big,
  sub,
  highlight = false,
}: {
  kicker: string;
  big: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="flex flex-col justify-center rounded-2xl p-5 text-center"
      style={
        highlight
          ? { backgroundColor: DYB_GREEN, color: DYB_WHITE }
          : { backgroundColor: "rgba(255,255,255,0.06)", color: DYB_WHITE }
      }
    >
      <span
        className="text-[11px] font-bold uppercase tracking-wider"
        style={{
          color: highlight ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.55)",
        }}
      >
        {kicker}
      </span>
      <span className="mt-1 font-heading text-2xl font-bold uppercase leading-tight">
        {big}
      </span>
      <span
        className="mt-1.5 text-xs leading-relaxed"
        style={{
          color: highlight ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.55)",
        }}
      >
        {sub}
      </span>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="flex items-center justify-center py-1 md:py-0">
      <ArrowRight
        className="h-5 w-5 rotate-90 md:rotate-0"
        style={{ color: NG_ORANGE }}
      />
    </div>
  );
}

function BenefitCard({ title, body }: { title: string; body: string }) {
  return (
    <Card style={{ backgroundColor: DYB_WHITE }}>
      <CardContent className="flex gap-3 p-5">
        <CheckCircle2
          className="mt-0.5 h-5 w-5 shrink-0"
          style={{ color: DYB_GREEN }}
        />
        <div>
          <h3 className="font-heading text-lg font-bold uppercase leading-tight">
            {title}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-black/60">{body}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function PointCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
    >
      <span className="text-white [&>svg]:h-6 [&>svg]:w-6">{icon}</span>
      <h3 className="mt-3 font-heading text-lg font-bold uppercase leading-tight">
        {title}
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-white/75">{body}</p>
    </div>
  );
}

// Inline wordmark for the small footer line — ALL BLACK (no orange).
function NearGearWordmarkInline() {
  return (
    <span
      className="font-heading font-bold tracking-tight"
      style={{ color: DYB_BLACK }}
    >
      NearGear
    </span>
  );
}
