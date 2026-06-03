import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  CheckCircle2,
  HandCoins,
  MapPin,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

// ============================================================================
// DYB co-branded pitch page  —  STATIC DEMO ONLY
// No referral capture, no partner-table reads, no signup wiring. Pure visual
// pitch to show the Dragon Youth Baseball board. Ace is hidden on /dyb via
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
// NearGear orange — ACCENT ONLY. Thin rules, the NearGear wordmark, one CTA
// highlight. Must NOT compete with the green.
const NG_ORANGE = "#ff6b35";

export const metadata: Metadata = {
  title: "NearGear × Dragon Youth Baseball — A Sponsorship-Revenue Partnership",
  description:
    "A gear marketplace that recirculates equipment within the DYB community and returns 30% of platform fees to Dragon Youth Baseball as a 501(c)(3) contribution. $0 upfront.",
  robots: { index: false, follow: false }, // private board demo
};

// Reusable NearGear wordmark — orange is the one place it shows up at size.
function NearGearWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-heading font-bold tracking-tight ${className}`}>
      <span style={{ color: DYB_WHITE }}>Near</span>
      <span style={{ color: NG_ORANGE }}>Gear</span>
    </span>
  );
}

export default function DybPitchPage() {
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
        className="px-5 pb-16 pt-12 md:px-8 md:pb-24 md:pt-16"
      >
        <div className="mx-auto max-w-3xl">
          {/* Co-branded lockup */}
          <div className="flex flex-wrap items-center gap-3 text-xl md:text-2xl">
            <NearGearWordmark />
            <span style={{ color: NG_ORANGE }} className="font-heading text-lg">
              ×
            </span>
            {/* Logo placeholder slot — awaiting DYB's official mark */}
            <span className="flex items-center gap-2">
              <span
                aria-label="Dragon Youth Baseball logo placeholder"
                style={{ borderColor: "rgba(255,255,255,0.5)" }}
                className="grid h-9 w-9 place-items-center rounded-full border border-dashed text-[9px] uppercase tracking-wide text-white/60"
              >
                DYB
              </span>
              <span className="font-heading font-bold tracking-tight">
                Dragon Youth Baseball
              </span>
            </span>
          </div>

          <div
            style={{ backgroundColor: NG_ORANGE }}
            className="mt-7 h-1 w-16 rounded-full"
          />

          <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-white/70">
            A sponsorship-revenue partnership for DYB
          </p>
          <h1 className="mt-3 font-heading text-[clamp(2.5rem,9vw,5rem)] font-bold uppercase leading-[0.9]">
            Turn outgrown gear
            <br />
            into league revenue.
          </h1>
          <p className="mt-6 max-w-[48ch] text-lg leading-relaxed text-white/85 md:text-xl">
            NearGear is a local marketplace that keeps baseball gear moving
            <em> within </em> the DYB community — and sends a share of every sale
            back to the league. No fundraiser, no inventory, no upfront cost.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <CtaButton primary href="#cta">
              See how it works
            </CtaButton>
            <CtaButton href="#money">The money, plainly</CtaButton>
          </div>
        </div>
      </section>

      {/* ===================== 2. WHO DYB IS ===================== */}
      <section className="px-5 py-14 md:px-8 md:py-20">
        <div className="mx-auto max-w-3xl">
          <SectionLabel>Built for your league specifically</SectionLabel>
          <h2 className="mt-3 font-heading text-[clamp(1.9rem,6vw,3rem)] font-bold uppercase leading-tight">
            We know who Dragon Youth Baseball is.
          </h2>
          <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-black/70">
            This isn&apos;t a generic pitch. DYB —{" "}
            <span className="font-semibold" style={{ color: DYB_GREEN }}>
              Southlake Baseball Association, d/b/a Dragon Youth Baseball
            </span>{" "}
            — is one of the fastest-growing youth baseball organizations in North
            Texas, run entirely by volunteers who already give the league more
            than enough of their weekends.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FactCard icon={<Users />} stat="1,000+" label="Registered players" />
            <FactCard icon={<MapPin />} stat="Southlake" label="Heart of DFW" />
            <FactCard
              icon={<Award />}
              stat="501(c)(3)"
              label="All-volunteer board"
            />
          </div>
        </div>
      </section>

      {/* ===================== 3. HOW THE MONEY WORKS ===================== */}
      <section
        id="money"
        style={{ backgroundColor: DYB_BLACK, color: DYB_WHITE }}
        className="px-5 py-14 md:px-8 md:py-20"
      >
        <div className="mx-auto max-w-3xl">
          <SectionLabel onDark>How the money works</SectionLabel>
          <h2 className="mt-3 font-heading text-[clamp(1.9rem,6vw,3rem)] font-bold uppercase leading-tight">
            $0 upfront. A check every quarter.
          </h2>
          <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-white/70">
            NearGear charges the <em>seller</em> a flat 8% platform fee when an
            item sells. DYB receives <strong>30% of that fee</strong> on every
            verified DYB member&apos;s sale — paid quarterly as a 501(c)(3)
            charitable contribution.
          </p>

          {/* Money flow — three steps, unambiguous at a glance */}
          <div className="mt-9 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch">
            <FlowStep
              kicker="A family sells"
              big="$100"
              sub="used gear on NearGear"
            />
            <FlowArrow />
            <FlowStep
              kicker="NearGear fee (8%)"
              big="$8.00"
              sub="charged to the seller"
            />
            <FlowArrow />
            <FlowStep
              kicker="DYB receives (30%)"
              big="$2.40"
              sub="to the league, every sale"
              highlight
            />
          </div>

          <p className="mt-6 text-sm leading-relaxed text-white/55">
            That&apos;s about <strong className="text-white">2.4%</strong> of
            every gross sale flowing back to DYB — passive, recurring, and tied
            to nothing but your families doing what they already do: buying and
            selling gear as kids grow.
          </p>

          <div
            style={{ borderColor: NG_ORANGE }}
            className="mt-8 flex items-start gap-3 border-l-2 pl-4"
          >
            <HandCoins className="mt-0.5 h-5 w-5 shrink-0" style={{ color: NG_ORANGE }} />
            <p className="text-sm leading-relaxed text-white/80">
              No booth to staff, no product to warehouse, no checks to chase. The
              league does nothing operationally — NearGear runs the marketplace,
              verifies members, and cuts the contribution.
            </p>
          </div>
        </div>
      </section>

      {/* ===================== 4. WHAT FAMILIES GET ===================== */}
      <section className="px-5 py-14 md:px-8 md:py-20">
        <div className="mx-auto max-w-3xl">
          <SectionLabel>What DYB families get</SectionLabel>
          <h2 className="mt-3 font-heading text-[clamp(1.9rem,6vw,3rem)] font-bold uppercase leading-tight">
            Worth it for the parents, too.
          </h2>

          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <BenefitCard
              title="Free to list"
              body="Post gear in minutes. You only pay when it actually sells — never to list."
            />
            <BenefitCard
              title="Local, verified, safe"
              body="Trades stay inside the DYB community. Real families, verified members, safe meetups."
            />
            <BenefitCard
              title="No more tire-kickers"
              body="No lowball DMs or no-shows. Serious local buyers who need gear that fits their kid."
            />
            <BenefitCard
              title="Gear that recirculates"
              body="Last season's cleats become next season's first pair — kept in the community, out of the landfill."
            />
          </div>
        </div>
      </section>

      {/* ===================== 5. WHY NOW / FIRST-MOVER ===================== */}
      <section
        style={{
          background: `linear-gradient(160deg, ${DYB_GREEN} 0%, ${DYB_GREEN_DEEP} 100%)`,
          color: DYB_WHITE,
        }}
        className="px-5 py-14 md:px-8 md:py-20"
      >
        <div className="mx-auto max-w-3xl">
          <SectionLabel onDark>
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Why now
            </span>
          </SectionLabel>
          <h2 className="mt-3 font-heading text-[clamp(1.9rem,6vw,3rem)] font-bold uppercase leading-tight">
            Be the first league in DFW.
          </h2>
          <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-white/85">
            NearGear is launching league partnerships across the metroplex, and
            DYB is our first choice to lead. The founding partner sets the
            template — top placement, a co-branded marketplace, and the
            case-study every other North Texas league hears about next.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <PointCard
              icon={<TrendingUp />}
              title="First-mover terms"
              body="Founding-partner revenue share, locked in as we grow."
            />
            <PointCard
              icon={<ShieldCheck />}
              title="Co-branded presence"
              body="NearGear × DYB, front and center for your families."
            />
            <PointCard
              icon={<Award />}
              title="The flagship story"
              body="The league every other DFW org points to."
            />
          </div>
        </div>
      </section>

      {/* ===================== 6. CTA ===================== */}
      <section id="cta" className="px-5 py-16 md:px-8 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <div
            aria-label="Dragon Youth Baseball logo placeholder"
            style={{ borderColor: DYB_GREEN, color: DYB_GREEN }}
            className="mx-auto grid h-14 w-14 place-items-center rounded-full border-2 border-dashed text-[10px] font-bold uppercase tracking-wide"
          >
            DYB
          </div>
          <h2 className="mt-6 font-heading text-[clamp(2rem,7vw,3.5rem)] font-bold uppercase leading-[0.95]">
            Bring NearGear to DYB.
          </h2>
          <p className="mx-auto mt-4 max-w-[44ch] text-lg leading-relaxed text-black/65">
            A new revenue stream for the league, a better way to swap gear for
            your families, and nothing for the board to run. Let&apos;s talk it
            through.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            {/* Static demo — non-functional placeholder (scrolls to top). */}
            <CtaButton primary href="#dyb-top">
              Bring NearGear to DYB
            </CtaButton>
          </div>

          <p className="mt-8 text-xs leading-relaxed text-black/40">
            <NearGearWordmarkInline /> × Dragon Youth Baseball · Preliminary
            partnership concept for board review. Figures illustrative; final
            terms subject to a signed agreement.
          </p>
        </div>
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Small presentational helpers (kept local to this static page).
// ---------------------------------------------------------------------------

function SectionLabel({
  children,
  onDark = false,
}: {
  children: React.ReactNode;
  onDark?: boolean;
}) {
  return (
    <p
      className="text-xs font-bold uppercase tracking-[0.2em]"
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
}: {
  href: string;
  children: React.ReactNode;
  primary?: boolean;
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

function FactCard({
  icon,
  stat,
  label,
}: {
  icon: React.ReactNode;
  stat: string;
  label: string;
}) {
  return (
    <Card className="ring-0" style={{ backgroundColor: DYB_WHITE }}>
      <CardContent className="flex flex-col gap-1 p-5">
        <span style={{ color: DYB_GREEN }} className="[&>svg]:h-6 [&>svg]:w-6">
          {icon}
        </span>
        <span className="mt-2 font-heading text-2xl font-bold uppercase leading-none">
          {stat}
        </span>
        <span className="text-sm text-black/55">{label}</span>
      </CardContent>
    </Card>
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
        style={{ color: highlight ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.55)" }}
      >
        {kicker}
      </span>
      <span className="mt-1 font-heading text-4xl font-bold leading-none">
        {big}
      </span>
      <span
        className="mt-1.5 text-xs"
        style={{ color: highlight ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.5)" }}
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
      <p className="mt-1 text-sm leading-relaxed text-white/70">{body}</p>
    </div>
  );
}

// Inline wordmark for the small footer line (dark text on white).
function NearGearWordmarkInline() {
  return (
    <span className="font-heading font-bold tracking-tight">
      <span style={{ color: DYB_BLACK }}>Near</span>
      <span style={{ color: NG_ORANGE }}>Gear</span>
    </span>
  );
}
