import twilio from "twilio";
import { mapsLink } from "./templates";

let cachedClient: ReturnType<typeof twilio> | null | "unconfigured" = null;

function getClient(): ReturnType<typeof twilio> | null {
  if (cachedClient === "unconfigured") return null;
  if (cachedClient) return cachedClient;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    cachedClient = "unconfigured";
    return null;
  }
  cachedClient = twilio(sid, token);
  return cachedClient;
}

function fromNumber(): string | null {
  return process.env.TWILIO_PHONE_NUMBER || null;
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://near-gear.com";
}

async function sendSms(to: string | null, body: string): Promise<void> {
  if (!to) {
    console.log(`[sms:skip] no phone, would send: ${body.slice(0, 60)}…`);
    return;
  }
  const client = getClient();
  const from = fromNumber();
  if (!client || !from) {
    console.log(`[sms:skip] twilio unconfigured, would send to ${to}: ${body.slice(0, 60)}…`);
    return;
  }
  try {
    const msg = await client.messages.create({ to, from, body });
    console.log(`[sms:sent] ${msg.sid} → ${to}`);
  } catch (err) {
    console.error(`[sms:error] → ${to}:`, err);
  }
}

// ----- New meetup request (to seller) -----
export async function sendNewRequestSMS(opts: {
  sellerPhone: string | null;
  buyerName: string;
  listingTitle: string;
  offeredPrice: number;
  meetupId: string;
}): Promise<void> {
  const dollars = (opts.offeredPrice / 100).toFixed(0);
  const body = `NearGear: ${opts.buyerName} wants to buy your ${opts.listingTitle} for $${dollars}. Open the app to accept or decline: ${appUrl()}/meetups/${opts.meetupId}\n- NearGear Team`;
  await sendSms(opts.sellerPhone, body);
}

// ----- Meetup accepted (to buyer) -----
export async function sendMeetupAcceptedSMS(opts: {
  buyerPhone: string | null;
  listingTitle: string;
  dateLine: string;
  zoneName: string;
  zoneAddress: string;
  meetupId: string;
}): Promise<void> {
  const body = `NearGear: Your meetup for ${opts.listingTitle} is confirmed for ${opts.dateLine} at ${opts.zoneName}.\n\nGet directions: ${mapsLink(opts.zoneAddress)}\n\nMessage the seller in the app to confirm exact time: ${appUrl()}/meetups/${opts.meetupId}\n- NearGear Team`;
  await sendSms(opts.buyerPhone, body);
}

// ----- 2-hour reminder (both parties) -----
export async function sendMeetupReminderSMS(opts: {
  toPhone: string | null;
  listingTitle: string;
  zoneName: string;
  zoneAddress: string;
}): Promise<void> {
  const body = `NearGear reminder: Your meetup for ${opts.listingTitle} starts in about 2 hours at ${opts.zoneName}, ${opts.zoneAddress}.\n\nGet directions: ${mapsLink(opts.zoneAddress)}\n\nSee you there! 🤝\n- NearGear Team`;
  await sendSms(opts.toPhone, body);
}
