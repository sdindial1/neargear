import { Resend } from "resend";
import {
  ctaButton,
  emailShell,
  escapeHtml,
  firstName,
  formatMoney,
  mapsLink,
} from "./templates";

const FROM = "NearGear <support@near-gear.com>";
const FROM_FALLBACK = "NearGear <onboarding@resend.dev>";

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
      // Domain not verified yet → retry with onboarding sender once
      if (attempt === "primary" && /domain|from/i.test(String(error.message))) {
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
