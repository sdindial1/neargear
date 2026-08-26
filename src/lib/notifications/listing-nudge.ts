/**
 * "You signed up but haven't listed" — a three-email sequence, then silence.
 *
 * These are the only NON-transactional emails NearGear sends, which is why they
 * carry an unsubscribe link and the transactional sends do not. The opt-out is
 * scoped to this sequence alone: someone who unsubscribes here must still be
 * told when their item sells.
 *
 * ALL THREE USE emailLayout(). There is one email design and this does not
 * introduce a second — the whole reason twelve transactional sends share a
 * layout is that a fix to it reaches all of them at once.
 *
 * GIVEAWAY WORDING IS CONSTRAINED BY THE OFFICIAL RULES.
 * Rules 4.1 defines a Qualifying Listing as one that "remains posted and active
 * through the Entry Deadline", and 5 voids the entry if the listing is removed.
 * So the copy may never say an entry is banked or permanent. That is not
 * theoretical: taking down one duplicate listing moved the live entry count
 * from 5 to 4. Every giveaway mention here is qualified with "for as long as it
 * stays posted", and the whole block is omitted once the Promotion is over.
 */
import {
  emailLayout,
  type EmailLayoutOpts,
} from "./templates";
import {
  GIVEAWAY_GOAL,
  PROMOTION_END_ISO,
  PROMOTION_END_LABEL,
} from "@/lib/giveaway";

export type NudgeStep = 1 | 2 | 3;

export interface NudgeRecipient {
  email: string;
  fullName: string | null;
  unsubscribeToken: string;
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://near-gear.com";
}

function firstName(full: string | null): string {
  const n = (full ?? "").trim().split(/\s+/)[0];
  return n || "there";
}

/**
 * Is the Promotion still running? Copy that dangles a drawing which has already
 * closed is worse than copy with no hook at all.
 *
 * Only the END DATE is checked here. The other terminator — reaching
 * GIVEAWAY_GOAL active listings (Rules 3(a)) — needs a live count, so the
 * caller passes it in. Defaulting to "running" would be the wrong failure
 * direction, so an unknown count suppresses the block.
 */
export function promotionOpen(activeListings: number | null): boolean {
  if (activeListings == null) return false;
  if (activeListings >= GIVEAWAY_GOAL) return false;
  return Date.now() < Date.parse(PROMOTION_END_ISO);
}

function unsubscribeUrl(token: string): string {
  return `${appUrl()}/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * The footer line. Plain text on purpose — emailLayout's ctaNote renders it
 * small and muted, which is where an opt-out belongs: findable, not shouted.
 */
function unsubNote(token: string): string {
  return (
    `You're getting this because you created a NearGear account. ` +
    `Not planning to list? Unsubscribe from these reminders: ${unsubscribeUrl(token)} ` +
    `— you'll still get messages about your account and any sales.`
  );
}

/** The giveaway paragraph, or nothing. Wording is Rules-4.1-safe. */
function giveawayLine(open: boolean): string | null {
  if (!open) return null;
  return (
    `List any gear your kid has outgrown and you're entered to win a $500 bat. ` +
    `Every item you list is another entry, for as long as it stays posted.`
  );
}

interface BuiltNudge {
  subject: string;
  layout: EmailLayoutOpts;
}

export function buildNudge(
  step: NudgeStep,
  to: NudgeRecipient,
  opts: { promotionOpen: boolean },
): BuiltNudge {
  const name = firstName(to.fullName);
  const sell = `${appUrl()}/sell`;
  const give = giveawayLine(opts.promotionOpen);

  if (step === 1) {
    return {
      subject: "Your first listing takes about 60 seconds",
      layout: {
        preheader: "Snap two photos — our AI writes the rest.",
        eyebrow: "Getting started",
        heading: "Your first listing takes about 60 seconds",
        intro: [
          `Hi ${name}, thanks for joining NearGear. You're all set up — there's just one thing left.`,
          ...(give ? [give] : []),
        ],
        bodyHtml: `
          <p style="margin:0 0 10px;"><strong>Here's the whole process:</strong></p>
          <p style="margin:0 0 6px;">1. Snap 2 photos of the item</p>
          <p style="margin:0 0 6px;">2. Our AI writes the title, price and description for you</p>
          <p style="margin:0 0 10px;">3. Tap Post</p>
          <p style="margin:0;">That's it. Free to list, and you keep 90% when it sells.</p>
        `,
        cta: { href: sell, label: "List your first item" },
        ctaNote:
          "Meet at a verified safe zone near you. Payment is held until the handoff. " +
          unsubNote(to.unsubscribeToken),
      },
    };
  }

  if (step === 2) {
    return {
      subject: "A glove listed in Keller yesterday",
      layout: {
        preheader: "Local gear is moving. Yours can too.",
        eyebrow: "Still there?",
        heading: "Gear is moving in your area",
        intro: [
          `Hi ${name} — a Rawlings youth glove went up in Keller and it took about a minute to post.`,
          `Two photos is genuinely all you need; the AI fills in the title, the price and the description.`,
          ...(give ? [give] : []),
        ],
        cta: { href: sell, label: "Post your first item" },
        ctaNote: "Free to list. You keep 90% when it sells. " + unsubNote(to.unsubscribeToken),
      },
    };
  }

  // Step 3: one line and the button. The deadline is real — Rules 3(b) — so it
  // is stated plainly rather than dressed up. No invented scarcity.
  return {
    subject: "Last one from us",
    layout: {
      preheader: "One tap, and you're listed.",
      eyebrow: "Last reminder",
      heading: "Last one from us",
      intro: [
        give
          ? `The $500 bat drawing closes on ${PROMOTION_END_LABEL}, or when NearGear reaches ${GIVEAWAY_GOAL} active listings — whichever comes first. One listing gets you an entry, for as long as it stays posted.`
          : `If you've got gear sitting in the garage, it takes about a minute to list.`,
      ],
      cta: { href: sell, label: "List an item" },
      ctaNote:
        "This is the last reminder we'll send about listing. " +
        unsubNote(to.unsubscribeToken),
    },
  };
}

/** Rendered subject + html + text, ready for the sender. */
export function renderNudge(
  step: NudgeStep,
  to: NudgeRecipient,
  opts: { promotionOpen: boolean },
) {
  const built = buildNudge(step, to, opts);
  return { subject: built.subject, mail: emailLayout(built.layout) };
}

/** Hours after signup each step becomes due. */
export const NUDGE_SCHEDULE: Record<NudgeStep, number> = {
  1: 24,
  2: 72,
  3: 24 * 7,
};
