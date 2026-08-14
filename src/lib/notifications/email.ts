import { Resend } from "resend";
import { alertCritical } from "./alert";
import {
  conditionLabel,
  emailLayout,
  firstName,
  formatMoney,
  mapsLink,
  orderRef,
  type DetailRow,
  type ProductBlock,
} from "./templates";

const FROM = "NearGear <support@near-gear.com>";
const FROM_FALLBACK = "NearGear <onboarding@resend.dev>";

/**
 * The fallback sender exists so a DNS problem does not swallow mail outright.
 * It is not a healthy state: a payment receipt arriving from a shared
 * onboarding@resend.dev address reads like phishing to a buyer, and shared
 * domains deliver worse. Worst of all it is INVISIBLE — mail keeps arriving, so
 * a lapsed domain looks exactly like a working one.
 *
 * So firing the fallback raises a critical alert. Throttled to once an hour per
 * process: the trigger is a configuration fault affecting every send, and
 * without the throttle a busy hour would mail one alert per transactional
 * email. The console line below is NOT throttled — the log always tells the
 * whole story even when the alert is suppressed.
 */
const FALLBACK_ALERT_INTERVAL_MS = 60 * 60 * 1000;
let lastFallbackAlertAt = 0;

function reportFallback(subject: string, to: string, reason: string): void {
  console.error(
    `[email:FALLBACK] near-gear.com rejected by Resend — "${subject}" → ${to} ` +
      `was sent from ${FROM_FALLBACK} instead. Reason: ${reason}`,
  );
  const now = Date.now();
  if (now - lastFallbackAlertAt < FALLBACK_ALERT_INTERVAL_MS) return;
  lastFallbackAlertAt = now;
  // Deliberately not awaited: alerting must never delay or fail a user-facing
  // send. alertCritical never throws.
  void alertCritical({
    event: "email_domain_unverified",
    summary:
      "Sending from support@near-gear.com failed; mail is going out from " +
      "onboarding@resend.dev. Check the Resend domain and DNS records.",
    details: { subject, recipient: to, resendError: reason, fallbackFrom: FROM_FALLBACK },
  });
}

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://near-gear.com";
}

// ---------------------------------------------------------------------------
// Shared input shapes
// ---------------------------------------------------------------------------

export interface EmailParty {
  email: string;
  fullName: string | null;
}

/** Everything the product card needs, straight off the listing row. */
export interface EmailListing {
  title: string;
  /** listings.photo_urls[0] — already an absolute public storage URL. */
  imageUrl?: string | null;
  /** Raw listings.condition enum; rendered via conditionLabel(). */
  condition?: string | null;
}

/** Where and when the meetup was, for the detail rows. */
export interface EmailMeetupContext {
  meetupId: string;
  dateLine: string;
  zoneName: string;
  zoneAddress: string;
}

/**
 * The five figures on an order, each named for exactly what it is.
 *
 * The old shape used `grossAmount` and `platformFee`, and the ambiguity was not
 * harmless: `grossAmount` was populated with the ITEM price and rendered to the
 * buyer as "You paid", understating the charge by precisely our Buyer
 * Protection fee. Naming every field for its role is what stops that recurring.
 */
export interface OrderMoney {
  /** What the item sold for. */
  itemPriceCents: number;
  /** 10% Buyer Protection, charged ON TOP of the item price. */
  buyerFeeCents: number;
  /** What the buyer's card was actually charged: item + buyer fee. */
  grossCapturedCents: number;
  /** Platform fee deducted from the seller. Zero for founding members. */
  sellerFeeCents: number;
  /** What the seller receives: item price − seller fee. */
  payoutCents: number;
}

/** "Marcus T." — enough to identify a counterparty without publishing them. */
function shortName(fullName: string | null | undefined): string {
  if (!fullName) return "A NearGear member";
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A NearGear member";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

function productOf(listing: EmailListing): ProductBlock {
  return {
    title: listing.title,
    imageUrl: listing.imageUrl ?? null,
    meta: conditionLabel(listing.condition),
  };
}

/** Location rows, shared by every email that references a meetup. */
function locationRows(
  meetup: EmailMeetupContext,
  opts: { directions?: boolean } = {},
): DetailRow[] {
  return [
    {
      label: "Safe zone",
      value: meetup.zoneName,
      sub: meetup.zoneAddress,
      link: opts.directions
        ? { href: mapsLink(meetup.zoneAddress), label: "Get directions" }
        : null,
    },
  ];
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

async function sendOrLog(
  to: string,
  subject: string,
  html: string,
  attempt: "primary" | "fallback" = "primary",
): Promise<void> {
  const client = getClient();
  if (!client) {
    console.log(`[email:skip] no RESEND_API_KEY, would send "${subject}" → ${to}`);
    return;
  }
  try {
    const { error } = await client.emails.send({
      from: attempt === "primary" ? FROM : FROM_FALLBACK,
      to,
      subject,
      html,
    });
    if (error) {
      // Domain not verified yet → retry with onboarding sender once, loudly.
      if (attempt === "primary" && /domain|from/i.test(String(error.message))) {
        reportFallback(subject, to, error.message);
        return sendOrLog(to, subject, html, "fallback");
      }
      console.error(`[email:error] "${subject}" → ${to}:`, error.message);
      return;
    }
    console.log(`[email:sent] "${subject}" → ${to}`);
  } catch (err) {
    console.error(`[email:throw] "${subject}" → ${to}:`, err);
  }
}

// ---------------------------------------------------------------------------
// 1. New buy request → seller
// ---------------------------------------------------------------------------

/**
 * The most time-sensitive event in the product, and until now it had no email
 * at all — the seller got an SMS (Twilio is unconfigured outside production)
 * and an in-app notification that does not alert in real time. A seller could
 * miss an offer entirely.
 */
export async function sendNewRequestEmail(opts: {
  seller: EmailParty;
  buyer: EmailParty;
  listing: EmailListing;
  meetup: EmailMeetupContext;
  offeredPriceCents: number;
}): Promise<void> {
  const { seller, buyer, listing, meetup, offeredPriceCents } = opts;
  const href = `${appUrl()}/meetups/${meetup.meetupId}`;

  const html = emailLayout({
    preheader: `${shortName(buyer.fullName)} offered ${formatMoney(offeredPriceCents)} for ${listing.title}.`,
    eyebrow: "New buy request",
    heading: "You have a new buy request",
    intro: [
      `Hi ${firstName(seller.fullName)} — ${shortName(buyer.fullName)} wants to buy your ${listing.title}.`,
      "Accept or decline in the app. The buyer is only charged once you accept.",
    ],
    product: productOf(listing),
    amount: {
      label: "Their offer",
      value: formatMoney(offeredPriceCents),
    },
    details: [
      { label: "Buyer", value: shortName(buyer.fullName) },
      { label: "Proposed time", value: meetup.dateLine },
      ...locationRows(meetup),
    ],
    cta: { href, label: "Review the request" },
    ctaNote: "Requests are easier to close while the buyer is still looking.",
  });

  await sendOrLog(seller.email, "New buy request on NearGear 🛎️", html);
}

// ---------------------------------------------------------------------------
// 2. Request declined → buyer
// ---------------------------------------------------------------------------

export async function sendRequestDeclinedEmail(opts: {
  buyer: EmailParty;
  seller: EmailParty;
  listing: EmailListing;
  listingId: string;
  offeredPriceCents: number;
}): Promise<void> {
  const { buyer, seller, listing, listingId, offeredPriceCents } = opts;
  const href = `${appUrl()}/listings/${listingId}`;

  const html = emailLayout({
    preheader: `${shortName(seller.fullName)} declined your request for ${listing.title}.`,
    eyebrow: "Request declined",
    heading: "Your request wasn't accepted",
    intro: [
      `Hi ${firstName(buyer.fullName)} — ${shortName(seller.fullName)} declined your request for ${listing.title}.`,
      "You were not charged. The listing is active again, so you can send a new request or keep looking.",
    ],
    product: productOf(listing),
    details: [
      { label: "You offered", value: formatMoney(offeredPriceCents) },
      { label: "Seller", value: shortName(seller.fullName) },
    ],
    cta: { href, label: "See the listing" },
  });

  await sendOrLog(buyer.email, "Your NearGear request was declined", html);
}

// ---------------------------------------------------------------------------
// 3. Meetup scheduled → both parties
// ---------------------------------------------------------------------------

export async function sendMeetupScheduledEmails(opts: {
  buyer: EmailParty;
  seller: EmailParty;
  listing: EmailListing;
  meetup: EmailMeetupContext;
  offeredPriceCents: number;
}): Promise<void> {
  const { buyer, seller, listing, meetup, offeredPriceCents } = opts;
  const href = `${appUrl()}/meetups/${meetup.meetupId}`;
  const product = productOf(listing);

  const sellerHtml = emailLayout({
    preheader: `You accepted ${firstName(buyer.fullName)}'s request for ${listing.title}.`,
    eyebrow: "Meetup scheduled",
    heading: "You accepted the request",
    intro: [
      `Hi ${firstName(seller.fullName)} — you accepted ${shortName(buyer.fullName)}'s request for ${listing.title}.`,
      `Message ${firstName(buyer.fullName)} in the app to firm up the exact time.`,
    ],
    product,
    details: [
      { label: "Buyer", value: shortName(buyer.fullName) },
      { label: "When", value: meetup.dateLine },
      ...locationRows(meetup),
      { label: "Agreed price", value: formatMoney(offeredPriceCents) },
    ],
    cta: { href, label: "Open the meetup" },
    ctaNote: "Mark the handoff complete in the app once you've met.",
  });

  const buyerHtml = emailLayout({
    preheader: `${firstName(seller.fullName)} accepted your request for ${listing.title}.`,
    eyebrow: "Meetup confirmed",
    heading: "Your meetup is confirmed",
    intro: [
      `Hi ${firstName(buyer.fullName)} — ${shortName(seller.fullName)} accepted your request for ${listing.title}.`,
      `Message ${firstName(seller.fullName)} in the app to firm up the exact time.`,
    ],
    product,
    details: [
      { label: "Seller", value: shortName(seller.fullName) },
      { label: "When", value: meetup.dateLine },
      ...locationRows(meetup, { directions: true }),
      { label: "Agreed price", value: formatMoney(offeredPriceCents) },
    ],
    cta: { href, label: "Open the meetup" },
    ctaNote: "Your payment is held until you confirm you received the item.",
  });

  await Promise.all([
    sendOrLog(seller.email, "You accepted a meetup request 🤝", sellerHtml),
    sendOrLog(buyer.email, "Your meetup is confirmed! 🎉", buyerHtml),
  ]);
}

// ---------------------------------------------------------------------------
// 4. Handoff confirmed → buyer's 24h window
// ---------------------------------------------------------------------------

/**
 * The one notification in the system with money auto-releasing on a timer tied
 * to the recipient's inaction, which is why it gets an email and not just an
 * in-app notice: the notification bell does not alert in real time (see
 * POST-LAUNCH.md item 7), so an in-app-only notice could elapse unseen and
 * auto-release the buyer's payment without them ever being offered the "report
 * a problem" path. That produces chargebacks instead of disputes.
 *
 * Must state plainly: the seller marked it handed off, the buyer can confirm
 * OR report a problem, the deadline, and what happens if they do nothing.
 */
export async function sendHandoffConfirmedEmail(opts: {
  buyer: EmailParty;
  seller: EmailParty;
  listing: EmailListing;
  meetupId: string;
  itemPriceCents: number;
}): Promise<void> {
  const { buyer, seller, listing, meetupId, itemPriceCents } = opts;
  // Both actions live on the meetup page: confirm receipt, or report a problem.
  const href = `${appUrl()}/meetups/${meetupId}`;

  const html = emailLayout({
    preheader: `${firstName(seller.fullName)} marked ${listing.title} as handed off — confirm or report a problem within 24 hours.`,
    eyebrow: "Action needed",
    heading: "Confirm you received your item",
    intro: [
      `Hi ${firstName(buyer.fullName)} — ${shortName(seller.fullName)} marked ${listing.title} as handed off.`,
    ],
    product: productOf(listing),
    notice: {
      title: "You have 24 hours to respond.",
      body:
        "If we don't hear from you, your payment is automatically released to " +
        "the seller and the sale is final.",
    },
    bodyHtml: `
      <p style="margin:0 0 8px;"><strong>Got the item?</strong> Confirm receipt — that releases payment right away and closes the sale.</p>
      <p style="margin:0;"><strong>Something wrong?</strong> Report a problem instead. Your payment stays held while we look into it.</p>
    `,
    details: [
      { label: "Seller", value: shortName(seller.fullName) },
      { label: "Item price", value: formatMoney(itemPriceCents) },
    ],
    cta: { href, label: "Confirm or report a problem" },
  });

  await sendOrLog(
    buyer.email,
    `Confirm you received ${listing.title} — 24 hours`,
    html,
  );
}

// ---------------------------------------------------------------------------
// 5. Order complete → buyer receipt + seller payout
// ---------------------------------------------------------------------------

/**
 * The buyer copy is a RECEIPT and must state the amount actually charged.
 *
 * It previously rendered the item price under the label "You paid", which
 * understated the charge by exactly the Buyer Protection fee — a $10.20 item
 * billed at $11.22 produced a receipt reading $10.20. The amount block now
 * leads with grossCapturedCents and itemises the fee beneath it, and OrderMoney
 * forces every caller to say which figure is which.
 */
export async function sendTransactionCompleteEmails(opts: {
  buyer: EmailParty;
  seller: EmailParty;
  listing: EmailListing;
  money: OrderMoney;
  orderId: string;
  transactionId: string | null;
  meetupId: string | null;
  /** Null when the release path could not resolve the meetup. */
  meetup?: EmailMeetupContext | null;
  metOn?: string | null;
  retailPriceCents?: number | null;
  sellerIsFounding?: boolean;
}): Promise<void> {
  const {
    buyer,
    seller,
    listing,
    money,
    orderId,
    transactionId,
    meetupId,
    meetup,
    metOn,
    retailPriceCents,
    sellerIsFounding,
  } = opts;

  const txHref = transactionId
    ? `${appUrl()}/profile/transactions/${transactionId}`
    : `${appUrl()}/profile/transactions`;
  const reviewHref = meetupId
    ? `${appUrl()}/reviews/${meetupId}`
    : `${appUrl()}/profile/transactions`;
  const product = productOf(listing);

  const savings =
    retailPriceCents && retailPriceCents > money.itemPriceCents
      ? retailPriceCents - money.itemPriceCents
      : null;

  const sharedRows: DetailRow[] = [
    ...(metOn ? [{ label: "Met on", value: metOn }] : []),
    ...(meetup ? locationRows(meetup) : []),
    { label: "Order reference", value: orderRef(orderId), mono: true },
  ];

  const buyerHtml = emailLayout({
    preheader: `Your receipt for ${listing.title} — ${formatMoney(money.grossCapturedCents)}.`,
    eyebrow: "Order complete",
    heading: "Your purchase is complete",
    intro: [
      `Hi ${firstName(buyer.fullName)} — the payment for your order has been released to the seller. Here's your receipt.`,
    ],
    product,
    amount: {
      label: "Total charged",
      value: formatMoney(money.grossCapturedCents),
      lines: [
        { label: "Item price", value: formatMoney(money.itemPriceCents) },
        {
          label: "Buyer Protection (10%)",
          value: formatMoney(money.buyerFeeCents),
        },
      ],
      note: savings ? `You saved ${formatMoney(savings)} versus buying new.` : null,
    },
    details: [
      { label: "Seller", value: shortName(seller.fullName) },
      ...sharedRows,
    ],
    cta: { href: reviewHref, label: "Leave a review" },
    ctaNote: "Help other DFW families — reviews take about a minute.",
  });

  const sellerHtml = emailLayout({
    preheader: `Your payout for ${listing.title} — ${formatMoney(money.payoutCents)}.`,
    eyebrow: "Payment released",
    heading: "Your payout is on the way",
    intro: [
      `Hi ${firstName(seller.fullName)} — your sale of ${listing.title} is complete and the payout has been released.`,
      "This transfers to your connected Stripe account. When it reaches your bank follows your Stripe payout schedule.",
    ],
    product,
    amount: {
      label: "Your payout",
      value: formatMoney(money.payoutCents),
      lines: [
        { label: "Sale price", value: formatMoney(money.itemPriceCents) },
        {
          label: sellerIsFounding
            ? "NearGear fee (Founding Family)"
            : "NearGear fee",
          value: sellerIsFounding
            ? formatMoney(0)
            : `−${formatMoney(money.sellerFeeCents)}`,
        },
      ],
    },
    details: [
      { label: "Buyer", value: shortName(buyer.fullName) },
      ...sharedRows,
    ],
    cta: { href: txHref, label: "View transaction" },
  });

  await Promise.all([
    sendOrLog(seller.email, "Payment released 💰", sellerHtml),
    sendOrLog(buyer.email, "Enjoy your new gear! 🏅", buyerHtml),
  ]);
}

// ---------------------------------------------------------------------------
// 6. Refund issued → both parties
// ---------------------------------------------------------------------------

export type RefundEmailReason =
  | "cancelled"
  | "seller_no_show"
  | "buyer_no_show"
  | "dispute_upheld";

const REFUND_WHY: Record<RefundEmailReason, string> = {
  cancelled: "the meetup was cancelled",
  seller_no_show: "the seller didn't show up",
  buyer_no_show: "the meetup didn't happen",
  dispute_upheld: "we reviewed your report and decided in your favour",
};

/**
 * We take real money and give it back, and until now said so only in an in-app
 * notification. A refund is the receipt people most expect to find in their
 * inbox — not least because it is the one they forward to a spouse.
 */
export async function sendRefundEmails(opts: {
  buyer: EmailParty;
  seller: EmailParty | null;
  listing: EmailListing;
  orderId: string;
  amountCents: number;
  reason: RefundEmailReason;
}): Promise<void> {
  const { buyer, seller, listing, orderId, amountCents, reason } = opts;
  const href = `${appUrl()}/profile/transactions`;
  const product = productOf(listing);
  const refRow: DetailRow = {
    label: "Order reference",
    value: orderRef(orderId),
    mono: true,
  };

  const buyerHtml = emailLayout({
    preheader: `${formatMoney(amountCents)} is on its way back to you for ${listing.title}.`,
    eyebrow: "Refund issued",
    heading: "Your refund is on the way",
    intro: [
      `Hi ${firstName(buyer.fullName)} — we've refunded your order for ${listing.title} because ${REFUND_WHY[reason]}.`,
    ],
    product,
    amount: {
      label: "Refunded",
      value: formatMoney(amountCents),
      note:
        "This is the full amount you paid, including the Buyer Protection fee. " +
        "Refunds usually appear on your original payment method within 5–10 business days.",
    },
    details: [refRow],
    cta: { href, label: "View your orders" },
  });

  await sendOrLog(buyer.email, "Your NearGear refund is on the way 💸", buyerHtml);

  if (!seller?.email) return;

  const sellerHtml = emailLayout({
    preheader: `The order for ${listing.title} was refunded to the buyer.`,
    eyebrow: "Order refunded",
    heading: "This order was refunded",
    intro: [
      `Hi ${firstName(seller.fullName)} — the payment for ${listing.title} was refunded to the buyer because ${REFUND_WHY[reason]}.`,
      "No payout will be made for this order. Your listing is active again if it wasn't removed.",
    ],
    product,
    details: [refRow],
    cta: { href: `${appUrl()}/profile/wallet`, label: "Open your wallet" },
  });

  await sendOrLog(seller.email, "An order was refunded", sellerHtml);
}

// ---------------------------------------------------------------------------
// 7. Dispute resolved in the seller's favour → both parties
// ---------------------------------------------------------------------------

/**
 * Only the release_seller branch sends this. When a case resolves as a refund,
 * refundOrder has already emailed both parties with `dispute_upheld` wording —
 * a second "case resolved" note would be duplicate mail about one decision.
 *
 * This email is also what makes the in-app copy honest: the notification tells
 * the buyer to reply to the email about their case, and before this that email
 * did not exist.
 */
export async function sendDisputeResolvedEmails(opts: {
  buyer: EmailParty;
  seller: EmailParty | null;
  listing: EmailListing;
  orderId: string;
  payoutCents: number;
}): Promise<void> {
  const { buyer, seller, listing, orderId, payoutCents } = opts;
  const product = productOf(listing);
  const refRow: DetailRow = {
    label: "Order reference",
    value: orderRef(orderId),
    mono: true,
  };

  const buyerHtml = emailLayout({
    preheader: `We've finished reviewing your case for ${listing.title}.`,
    eyebrow: "Case resolved",
    heading: "We've completed our review",
    intro: [
      `Hi ${firstName(buyer.fullName)} — we've reviewed your case for ${listing.title} and released the payment to the seller.`,
      "If you'd like to discuss the decision, reply to this email and it reaches our support team directly.",
    ],
    product,
    details: [refRow],
    cta: { href: `${appUrl()}/profile/transactions`, label: "View your orders" },
  });

  await sendOrLog(buyer.email, "Your NearGear case has been resolved", buyerHtml);

  if (!seller?.email) return;

  const sellerHtml = emailLayout({
    preheader: `Your case for ${listing.title} was resolved in your favour.`,
    eyebrow: "Case resolved",
    heading: "Your payment has been released",
    intro: [
      `Hi ${firstName(seller.fullName)} — we've finished reviewing the case for ${listing.title} and released your payout.`,
      "This transfers to your connected Stripe account.",
    ],
    product,
    amount: { label: "Your payout", value: formatMoney(payoutCents) },
    details: [refRow],
    cta: { href: `${appUrl()}/profile/wallet`, label: "Open your wallet" },
  });

  await sendOrLog(seller.email, "Your NearGear case was resolved 💰", sellerHtml);
}

// ---------------------------------------------------------------------------
// 8. Founding Family welcome
// ---------------------------------------------------------------------------

export async function sendFoundingWelcomeEmail(opts: {
  to: EmailParty;
  spotsRemaining: number;
  totalSpots: number;
}): Promise<void> {
  const { to, spotsRemaining, totalSpots } = opts;

  const html = emailLayout({
    preheader: `You're one of only ${totalSpots} DFW founding families on NearGear.`,
    eyebrow: "Founding Family",
    heading: "Welcome to the Founding Family",
    intro: [
      `Hi ${firstName(to.fullName)} — you're one of only ${totalSpots} DFW families with this spot, a permanent thank-you for backing NearGear from day one.`,
    ],
    bodyHtml: `
      <p style="margin:0 0 10px;"><strong>What you get, forever:</strong></p>
      <p style="margin:0 0 8px;"><strong>Zero platform fees.</strong> Every sale you make keeps 100% of the sale price. No fees, today or ever.</p>
      <p style="margin:0 0 8px;"><strong>Founding Family badge.</strong> Your profile carries the badge so other families know you were here first.</p>
      <p style="margin:0;"><strong>A direct line.</strong> Your feedback shapes how NearGear grows — reply to this email any time.</p>
    `,
    details: [
      { label: "Your spot", value: `1 of ${totalSpots}` },
      {
        label: "Still available",
        value: `${spotsRemaining} ${spotsRemaining === 1 ? "spot" : "spots"}`,
      },
    ],
    cta: { href: `${appUrl()}/`, label: "Open NearGear" },
    ctaNote: "Thanks for being one of the first.",
  });

  await sendOrLog(to.email, "Welcome to the NearGear Founding Family ⭐", html);
}
