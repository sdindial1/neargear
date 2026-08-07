import { Resend } from "resend";
import { alertCritical } from "./alert";
import {
  ctaButton,
  emailShell,
  escapeAttr,
  escapeHtml,
  firstName,
  formatMoney,
  mapsLink,
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

interface EmailParty {
  email: string;
  fullName: string | null;
}

interface MeetupContext {
  meetupId: string;
  listingTitle: string;
  dateLine: string;
  zoneName: string;
  zoneAddress: string;
  offeredPrice: number;
}

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

// ----- Meetup scheduled -----

export async function sendMeetupScheduledEmails(opts: {
  buyer: EmailParty;
  seller: EmailParty;
  meetup: MeetupContext;
}): Promise<void> {
  const { buyer, seller, meetup } = opts;
  const meetupHref = `${appUrl()}/meetups/${meetup.meetupId}`;

  const detailsBlock = (forBuyer: boolean) => `
    <p style="margin:0 0 6px;"><strong>Meetup details</strong></p>
    <p style="margin:0;">📅 ${escapeHtml(meetup.dateLine)}</p>
    <p style="margin:0;">📍 ${escapeHtml(meetup.zoneName)}<br/>
      <span style="color:#7a8896;">${escapeHtml(meetup.zoneAddress)}</span></p>
    <p style="margin:0;">💰 Agreed price: <strong>${formatMoney(meetup.offeredPrice)}</strong></p>
    ${
      forBuyer
        ? `<p style="margin:14px 0 0;"><a href="${mapsLink(meetup.zoneAddress)}" style="color:#ff6b35;">Get directions</a></p>`
        : ""
    }
  `;

  const sellerHtml = emailShell({
    preheader: `You accepted ${firstName(buyer.fullName)}'s request for ${meetup.listingTitle}.`,
    bodyHtml: `
      <p>Hi ${escapeHtml(firstName(seller.fullName))},</p>
      <p>You accepted <strong>${escapeHtml(firstName(buyer.fullName))}</strong>'s request for <strong>${escapeHtml(meetup.listingTitle)}</strong>.</p>
      ${detailsBlock(false)}
      <p>Message ${escapeHtml(firstName(buyer.fullName))} in the app to firm up the exact time.</p>
      ${ctaButton(meetupHref, "Open in App")}
      <p>See you at the meetup!<br/>The NearGear Team</p>
    `,
  });

  const buyerHtml = emailShell({
    preheader: `${firstName(seller.fullName)} accepted your request for ${meetup.listingTitle}.`,
    bodyHtml: `
      <p>Hi ${escapeHtml(firstName(buyer.fullName))},</p>
      <p>Great news — <strong>${escapeHtml(firstName(seller.fullName))}</strong> accepted your request for <strong>${escapeHtml(meetup.listingTitle)}</strong>.</p>
      ${detailsBlock(true)}
      <p>Message ${escapeHtml(firstName(seller.fullName))} in the app to firm up the exact time.</p>
      ${ctaButton(meetupHref, "Open in App")}
      <p>See you there!<br/>The NearGear Team</p>
    `,
  });

  await Promise.all([
    sendOrLog(seller.email, "You accepted a meetup request 🤝", sellerHtml),
    sendOrLog(buyer.email, "Your meetup is confirmed! 🎉", buyerHtml),
  ]);
}

// ----- Transaction complete -----

export async function sendTransactionCompleteEmails(opts: {
  buyer: EmailParty;
  seller: EmailParty;
  transactionId: string;
  meetupId: string;
  listingTitle: string;
  grossAmount: number;
  platformFee: number;
  netAmount: number;
  retailPrice: number | null;
}): Promise<void> {
  const {
    buyer,
    seller,
    transactionId,
    meetupId,
    listingTitle,
    grossAmount,
    platformFee,
    netAmount,
    retailPrice,
  } = opts;

  const txHref = `${appUrl()}/profile/transactions/${transactionId}`;
  const reviewHref = `${appUrl()}/reviews/${meetupId}`;
  const savings =
    retailPrice && retailPrice > grossAmount ? retailPrice - grossAmount : null;

  const sellerHtml = emailShell({
    preheader: `Your sale of ${listingTitle} is complete.`,
    bodyHtml: `
      <p>Hi ${escapeHtml(firstName(seller.fullName))},</p>
      <p>Your sale of <strong>${escapeHtml(listingTitle)}</strong> is complete.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0;font-size:15px;">
        <tr><td style="padding:4px 12px 4px 0;color:#7a8896;">Sale amount</td><td style="text-align:right;"><strong>${formatMoney(grossAmount)}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#7a8896;">NearGear fee</td><td style="text-align:right;color:#7a8896;">-${formatMoney(platformFee)}</td></tr>
        <tr><td style="padding:8px 12px 4px 0;border-top:1px solid #eef0f2;"><strong>Your earnings</strong></td><td style="text-align:right;border-top:1px solid #eef0f2;padding-top:8px;"><strong style="color:#ff6b35;">${formatMoney(netAmount)}</strong></td></tr>
      </table>
      <p>Your earnings will be available in your wallet. Payouts coming soon.</p>
      ${ctaButton(txHref, "View Transaction")}
      <p>Thanks for selling on NearGear!<br/>The NearGear Team</p>
    `,
  });

  const buyerHtml = emailShell({
    preheader: `Your purchase of ${listingTitle} is complete.`,
    bodyHtml: `
      <p>Hi ${escapeHtml(firstName(buyer.fullName))},</p>
      <p>Your purchase of <strong>${escapeHtml(listingTitle)}</strong> is complete.</p>
      <p>You paid: <strong>${formatMoney(grossAmount)}</strong>${
        savings
          ? `<br/><span style="color:#1e7e3e;">You saved ${formatMoney(savings)} vs buying new!</span>`
          : ""
      }</p>
      <p>Leave a review for ${escapeHtml(firstName(seller.fullName))} to help other NearGear families.</p>
      ${ctaButton(reviewHref, "Leave a Review")}
      <p>Thanks for buying on NearGear!<br/>The NearGear Team</p>
    `,
  });

  await Promise.all([
    sendOrLog(seller.email, "Payment incoming 💰", sellerHtml),
    sendOrLog(buyer.email, "Enjoy your new gear! 🏅", buyerHtml),
  ]);
}

// ----- Handoff confirmed — buyer's 24h window (payments Phase 3, rung 2) -----

/**
 * The one notification in the system with money auto-releasing on a timer tied
 * to the recipient's inaction, which is why it gets an email and not just an
 * in-app notice: the notification bell does not alert in real time (see
 * POST-LAUNCH.md item 7), so an in-app-only notice could elapse unseen and
 * auto-release the buyer's payment without them ever being offered the "report
 * a problem" path. That produces chargebacks instead of disputes.
 *
 * Deliberately narrow — a targeted backstop for THIS notice, not the general
 * real-time notifications overhaul, which stays deferred.
 *
 * Must state plainly: the seller marked it handed off, the buyer can confirm
 * OR report a problem, the deadline, and what happens if they do nothing.
 */
export async function sendHandoffConfirmedEmail(opts: {
  buyer: EmailParty;
  seller: EmailParty;
  meetupId: string;
  listingTitle: string;
  itemPriceCents: number;
}): Promise<void> {
  const { buyer, seller, meetupId, listingTitle, itemPriceCents } = opts;

  // Both actions live on the meetup page: confirm receipt, or report a problem.
  const meetupHref = `${appUrl()}/meetups/${meetupId}`;

  const html = emailShell({
    preheader: `${firstName(seller.fullName)} marked ${listingTitle} as handed off — confirm or report a problem within 24 hours.`,
    bodyHtml: `
      <p>Hi ${escapeHtml(firstName(buyer.fullName))},</p>
      <p><strong>${escapeHtml(firstName(seller.fullName))}</strong> marked
        <strong>${escapeHtml(listingTitle)}</strong>
        (${formatMoney(itemPriceCents)}) as handed off.</p>
      <p style="margin:16px 0;padding:12px 14px;background:#fff6f2;border-left:3px solid #ff6b35;border-radius:6px;">
        <strong>You have 24 hours to respond.</strong><br/>
        If we don't hear from you, your payment is automatically released to the
        seller and the sale is final.
      </p>
      <p>Two things you can do:</p>
      <ul style="padding-left:18px;margin:8px 0 0;">
        <li style="margin-bottom:6px;"><strong>Got the item?</strong> Confirm receipt — that releases payment right away and closes the sale.</li>
        <li><strong>Something wrong?</strong> Report a problem instead. Your payment stays held while we look into it.</li>
      </ul>
      ${ctaButton(meetupHref, "Confirm or Report a Problem")}
      <p style="color:#7a8896;font-size:13px;">If the button doesn't work, open
        <a href="${escapeAttr(meetupHref)}">${escapeHtml(meetupHref)}</a>.</p>
      <p>The NearGear Team</p>
    `,
  });

  await sendOrLog(
    buyer.email,
    `Confirm you received ${listingTitle} — 24 hours`,
    html,
  );
}

// ----- Founding Family welcome -----

export async function sendFoundingWelcomeEmail(opts: {
  to: EmailParty;
  spotsRemaining: number;
  totalSpots: number;
}): Promise<void> {
  const { to, spotsRemaining, totalSpots } = opts;
  const homeHref = `${appUrl()}/`;

  const html = emailShell({
    preheader: `You're one of only ${totalSpots} DFW founding families on NearGear.`,
    bodyHtml: `
      <p>Hi ${escapeHtml(firstName(to.fullName))},</p>
      <p>Welcome to the <strong>NearGear Founding Family</strong> ⭐</p>
      <p>You're one of only <strong>${totalSpots}</strong> DFW families with this spot — a permanent thank-you for backing NearGear from day one.</p>
      <p style="margin:18px 0 6px;"><strong>What you get, forever:</strong></p>
      <ul style="margin:0 0 10px;padding-left:20px;line-height:1.7;">
        <li><strong>Zero platform fees.</strong> Every sale you make on NearGear keeps 100% of the sale price. No fees, today or ever.</li>
        <li><strong>Founding Family badge.</strong> Your profile carries the exclusive ⭐ badge so other families know you were here first.</li>
        <li><strong>A direct line.</strong> Your feedback shapes how NearGear grows. Reply to this email any time.</li>
      </ul>
      <p style="color:#7a8896;font-size:13px;">${spotsRemaining} of ${totalSpots} spots still available for other DFW families.</p>
      ${ctaButton(homeHref, "Open NearGear")}
      <p>Thanks for being one of the first.<br/>The NearGear Team</p>
    `,
  });

  await sendOrLog(
    to.email,
    "Welcome to the NearGear Founding Family ⭐",
    html,
  );
}
