'use client';

import Link from 'next/link';
import FlowArt, { FlowSection } from '@/components/ui/story-scroll';

const HEADLINE =
  'text-[clamp(2.5rem,10vw,14rem)] font-heading font-bold leading-[0.85] uppercase tracking-tight';
const LABEL = 'text-xs font-bold uppercase tracking-[0.2em]';
const BODY = 'text-[clamp(0.95rem,2vw,2rem)] font-normal leading-relaxed';
const CARD_HEAD = 'mb-2 text-sm font-bold uppercase tracking-wider';
const CARD_BODY = 'text-[clamp(0.85rem,1.3vw,1.05rem)] leading-relaxed opacity-75';

const NAVY_DEEP = '#071520';
const NAVY = '#0d2438';
const ORANGE = '#ff6b35';
const CREAM = '#f5f4f0';

export default function LandingPage() {
  return (
    <>
      {/* Fixed full-width nav — solid backdrop so it never blends into panel labels below */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between px-4 md:px-8"
        style={{
          backgroundColor: 'rgba(7, 21, 32, 0.92)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <Link
          href="/"
          aria-label="NearGear home"
          className="font-heading text-xl font-bold tracking-tight text-white md:text-2xl"
        >
          <span>Near</span>
          <span style={{ color: ORANGE }}>Gear</span>
        </Link>
        <Link
          href="/auth/login"
          className="text-xs font-bold uppercase tracking-widest text-white/90 transition hover:text-white md:text-sm"
        >
          Sign In
        </Link>
      </nav>

      <FlowArt aria-label="NearGear story scroll">
        {/* 01 — Hook (hero photo + orange-multiply tint) */}
        <FlowSection
          aria-label="What NearGear is"
          style={{
            backgroundImage:
              'url(https://images.unsplash.com/photo-1490578474895-699cd4e2cf59?w=2400&q=85&auto=format&fit=crop)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            color: '#fff',
            position: 'relative',
          }}
        >
          {/* Orange tint over the photo — multiply blend keeps detail */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: ORANGE,
              mixBlendMode: 'multiply',
              opacity: 0.75,
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />
          {/* Bottom gradient — softens the hand-off into panel 2 (navy) */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '30%',
              background:
                'linear-gradient(to bottom, transparent, rgba(7,21,32,0.4))',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          />

          <p
            className={`relative z-[3] ${LABEL}`}
            style={{ textShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
          >
            01 &mdash; DFW Sports Marketplace
          </p>
          <hr className="relative z-[3] my-[2vw] border-none border-t border-black/60 opacity-100" />
          <div className="relative z-[3]">
            <h1
              className={HEADLINE}
              style={{
                textShadow: '0 4px 32px rgba(0,0,0,0.4)',
                fontWeight: 900,
              }}
            >
              Gear
              <br />
              That
              <br />
              Moves.
            </h1>
            <p
              className={`mt-6 max-w-[50ch] ${BODY}`}
              style={{ textShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
            >
              DFW&apos;s AI-powered marketplace for youth sports gear. Buy and sell
              with local families &mdash; no algorithms, no tire-kickers, just
              real parents and real gear.
            </p>
          </div>

          {/* Bottom band — sport pills + stat callouts, sitting above the photo */}
          <div
            className="relative z-[3] mt-auto flex flex-col gap-[2.5vw]"
            style={{ textShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
          >
            <hr className="border-none border-t border-black/60" />
            <div className="flex flex-wrap gap-2">
              {[
                'Baseball',
                'Softball',
                'Soccer',
                'Football',
                'Basketball',
                'Volleyball',
                'Lacrosse',
                'Hockey',
                'Tennis',
                'Golf',
                'Track',
                'Swimming',
                'Gymnastics',
                'Wrestling',
              ].map((s) => (
                <span
                  key={s}
                  className="inline-block rounded-full border-[1.5px] border-white/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white md:px-4 md:text-xs"
                >
                  {s}
                </span>
              ))}
            </div>
            <hr className="border-none border-t border-black/60" />
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="font-heading text-[clamp(2.5rem,7vw,5rem)] font-extrabold leading-none">
                  $1,200+
                </p>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.18em] opacity-80 md:text-xs">
                  Avg gear spend per kid, per year
                </p>
              </div>
              <div className="text-right">
                <p className="font-heading text-[clamp(2.5rem,7vw,5rem)] font-extrabold leading-none">
                  DFW.
                </p>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.18em] opacity-80 md:text-xs">
                  Built local. Only local.
                </p>
              </div>
            </div>
          </div>
        </FlowSection>

        {/* 02 — The problem */}
        <FlowSection
          aria-label="The problem"
          style={{ backgroundColor: NAVY, color: '#fff' }}
        >
          <p className={LABEL}>02 &mdash; The Reality</p>
          <hr className="my-[2vw] border-none border-t border-white/40" />
          <div>
            <h2 className={HEADLINE}>
              $1,200
              <br />
              Per Kid
              <br />
              Per Season.
            </h2>
          </div>
          <hr className="my-[2vw] border-none border-t border-white/40" />
          <p className={`max-w-[50ch] ${BODY}`}>
            The average DFW sports family burns over $1,200 per child every year
            on gear. Most of it gets outgrown in a single season. There&apos;s a
            better way.
          </p>
          <hr className="my-[2vw] border-none border-t border-white/40" />
          <div className="flex flex-wrap gap-[3vw]">
            <div className="min-w-[180px] flex-1">
              <p className={CARD_HEAD} style={{ color: ORANGE }}>
                Ghosting
              </p>
              <p className={CARD_BODY}>
                Buyers flake. You drive across DFW for nothing. Facebook
                Marketplace is a graveyard of cancelled meetups.
              </p>
            </div>
            <div className="min-w-[180px] flex-1">
              <p className={CARD_HEAD} style={{ color: ORANGE }}>
                Tire-Kickers
              </p>
              <p className={CARD_BODY}>
                &ldquo;Is this still available?&rdquo; Twenty times. From people
                who never had any intention of buying.
              </p>
            </div>
            <div className="min-w-[180px] flex-1">
              <p className={CARD_HEAD} style={{ color: ORANGE }}>
                Sketchy Meetups
              </p>
              <p className={CARD_BODY}>
                Some random parking lot at night. No, thanks. You deserve safer
                ways to swap gear with strangers.
              </p>
            </div>
          </div>
        </FlowSection>

        {/* 03 — How it works */}
        <FlowSection
          aria-label="How it works"
          style={{ backgroundColor: CREAM, color: NAVY }}
        >
          <p className={LABEL}>03 &mdash; How It Works</p>
          <hr className="my-[2vw] border-none border-t border-black/40" />
          <div>
            <h2 className={HEADLINE}>
              Snap.
              <br />
              List.
              <br />
              Meet.
            </h2>
          </div>
          <hr className="my-[2vw] border-none border-t border-black/40" />
          <p className={`max-w-[50ch] ${BODY}`}>
            Three steps. Under two minutes. Your gear is live and matched to
            local buyers before the kids finish practice.
          </p>
          <hr className="my-[2vw] border-none border-t border-black/40" />
          <div className="flex flex-wrap gap-[3vw]">
            <div className="min-w-[180px] flex-1">
              <p className={CARD_HEAD} style={{ color: ORANGE }}>
                01 &mdash; Snap
              </p>
              <p className={CARD_BODY}>
                Take 2&ndash;5 photos. Ace, our AI, identifies the item, grades
                condition, and prices it fairly in seconds.
              </p>
            </div>
            <div className="min-w-[180px] flex-1">
              <p className={CARD_HEAD} style={{ color: ORANGE }}>
                02 &mdash; List
              </p>
              <p className={CARD_BODY}>
                Your listing goes live with clean photos, smart pricing, and
                size matching for buyers&apos; kids.
              </p>
            </div>
            <div className="min-w-[180px] flex-1">
              <p className={CARD_HEAD} style={{ color: ORANGE }}>
                03 &mdash; Meet
              </p>
              <p className={CARD_BODY}>
                Connect at one of 30+ verified Safe Zones across DFW.
                Deposit-backed. No ghosting.
              </p>
            </div>
          </div>
          <hr className="my-[2vw] border-none border-t border-black/40" />
          <p className="ml-auto mt-auto max-w-[50ch] text-right text-[clamp(1rem,2.2vw,1.5rem)] italic leading-relaxed opacity-80">
            Free to list. You only pay when you sell.
          </p>
        </FlowSection>

        {/* 04 — The difference */}
        <FlowSection
          aria-label="The difference"
          style={{ backgroundColor: NAVY_DEEP, color: '#fff' }}
        >
          <p className={LABEL} style={{ color: ORANGE }}>
            04 &mdash; The Difference
          </p>
          <hr className="my-[2vw] border-none border-t border-white/30" />
          <div>
            <h2 className={HEADLINE}>
              Local.
              <br />
              Verified.
              <br />
              Safe.
            </h2>
          </div>
          <hr className="my-[2vw] border-none border-t border-white/30" />
          <p className={`max-w-[50ch] ${BODY}`}>
            We&apos;re not eBay. We&apos;re not Facebook Marketplace. We&apos;re
            built for DFW sports families &mdash; and only DFW sports families.
          </p>
          <hr className="my-[2vw] border-none border-t border-white/30" />
          <div className="flex flex-wrap gap-[3vw]">
            <div className="min-w-[180px] flex-1">
              <p className="mb-2 font-heading text-3xl font-bold" style={{ color: ORANGE }}>
                30+
              </p>
              <p className={CARD_BODY}>
                Verified Safe Zones across DFW. Academy, Dick&apos;s, YMCAs,
                rec centers, libraries. Always public, always well-lit.
              </p>
            </div>
            <div className="min-w-[180px] flex-1">
              <p className="mb-2 font-heading text-3xl font-bold" style={{ color: ORANGE }}>
                14
              </p>
              <p className={CARD_BODY}>
                Sports covered. Baseball, soccer, football, basketball,
                volleyball, lacrosse, hockey &mdash; if your kid plays it, we
                cover it.
              </p>
            </div>
            <div className="min-w-[180px] flex-1">
              <p className="mb-2 font-heading text-3xl font-bold" style={{ color: ORANGE }}>
                100%
              </p>
              <p className={CARD_BODY}>
                Deposit-backed meetups. Every buyer puts skin in the game
                before you drive anywhere. No more ghosting.
              </p>
            </div>
          </div>
          <hr className="my-[2vw] border-none border-t border-white/30" />
          <div className="flex flex-wrap gap-[3vw]">
            <div className="min-w-[180px] flex-1">
              <p className={CARD_HEAD}>Ace handles the chat</p>
              <p className={CARD_BODY}>
                Our AI answers sizing, condition, and pricing questions so you
                only hear from serious buyers.
              </p>
            </div>
            <div className="min-w-[180px] flex-1">
              <p className={CARD_HEAD}>Founding family pricing</p>
              <p className={CARD_BODY}>
                First 15 families pay zero platform fees. Forever. Every sale,
                every season.
              </p>
            </div>
            <div className="min-w-[180px] flex-1">
              <p className={CARD_HEAD}>DFW-first</p>
              <p className={CARD_BODY}>
                Built by DFW parents, for DFW parents. We know the leagues, the
                fields, and the gear that matters here.
              </p>
            </div>
          </div>
        </FlowSection>

        {/* 05 — Signup CTA */}
        <FlowSection
          aria-label="Join NearGear"
          style={{ backgroundColor: ORANGE, color: '#fff' }}
        >
          <p className={LABEL}>05 &mdash; Join Now</p>
          <hr className="my-[2vw] border-none border-t border-black/60" />
          <div>
            <h2 className={HEADLINE}>
              Ready
              <br />
              To
              <br />
              Start?
            </h2>
          </div>
          <hr className="my-[2vw] border-none border-t border-black/60" />
          <p className={`max-w-[50ch] ${BODY}`}>
            Join DFW families buying and selling sports gear the smarter way.
            Free to sign up. Free to list. Founding spots still open.
          </p>
          <div className="mt-auto flex flex-wrap items-center gap-4 pt-[2vw]">
            <Link
              href="/auth/signup"
              className="inline-flex items-center justify-center rounded-full bg-white px-8 py-4 font-heading text-lg font-bold uppercase tracking-wider text-black shadow-lg transition hover:-translate-y-0.5 hover:bg-black hover:text-white md:px-12 md:py-5 md:text-xl"
            >
              Sign Up Free &rarr;
            </Link>
            <Link
              href="/browse"
              className="inline-flex items-center justify-center rounded-full border-2 border-white/80 px-8 py-4 font-heading text-lg font-bold uppercase tracking-wider text-white transition hover:bg-white/10 md:px-12 md:py-5 md:text-xl"
            >
              Browse First
            </Link>
          </div>
        </FlowSection>
      </FlowArt>
    </>
  );
}
