/**
 * Send the transactional emails to one address, for checking how real clients
 * render them — Gmail dark mode and images-blocked in particular, neither of
 * which can be verified from rendered HTML alone.
 *
 * Uses the REAL senders from src/lib/notifications/email.ts rather than
 * reimplementing any markup, so what lands in the inbox is exactly what
 * production sends.
 *
 * Sends to the address you pass and nowhere else. Both sides of an order are
 * addressed to that same recipient so a single inbox receives both copies.
 *
 * Run:
 *   npx tsx scripts/send-test-emails.ts you@example.com
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

// Links must look production-realistic rather than pointing at localhost.
// Set before the email module is used: appUrl() reads this at call time.
process.env.NEXT_PUBLIC_APP_URL =
  process.env.EMAIL_TEST_APP_URL || "https://near-gear.com";

import {
  sendNewRequestEmail,
  sendRefundEmails,
  sendTransactionCompleteEmails,
} from "@/lib/notifications/email";

interface TestListing {
  title: string;
  imageUrl: string | null;
  condition: string | null;
}

/**
 * Prefer a real listing so the product card exercises a genuine Supabase
 * Storage URL — the whole point is to see whether Gmail loads it.
 */
async function pickListing(): Promise<TestListing> {
  const fallback: TestListing = {
    title: "Riddell SpeedFlex Youth Football Helmet",
    imageUrl: null,
    condition: "good",
  };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) return fallback;

  const admin = createClient(url, serviceRole);
  const { data, error } = await admin
    .from("listings")
    .select("title, photo_urls, condition")
    .neq("photo_urls", "{}")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn(`[warn] listing lookup failed (${error.message}); using a stand-in.`);
    return fallback;
  }
  const row = data as {
    title: string;
    photo_urls: string[] | null;
    condition: string | null;
  } | null;
  if (!row?.photo_urls?.[0]) return fallback;

  console.log(`Using real listing: "${row.title}"`);
  console.log(`  photo: ${row.photo_urls[0]}`);
  return {
    title: row.title,
    imageUrl: row.photo_urls[0],
    condition: row.condition,
  };
}

async function main(): Promise<void> {
  const to = process.argv[2];
  if (!to) {
    console.error("usage: npx tsx scripts/send-test-emails.ts <recipient-email>");
    process.exit(1);
  }
  if (!process.env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY missing from .env.local — nothing would send.");
    process.exit(1);
  }

  const listing = await pickListing();
  if (!listing.imageUrl) {
    console.warn("[warn] no listing photo found — product cards render text-only.");
  }

  const buyer = { email: to, fullName: "Shaun Dindial" };
  const seller = { email: to, fullName: "Marcus Thompson" };

  const orderId = "4f2a9c11-8b3d-4e77-9f21-0ab8c7d64e19";
  const meetup = {
    meetupId: "9c2e1a55-77bd-4a10-8e33-1f4b2c9d5e88",
    dateLine: "Tue, Aug 12, 5 PM – 6 PM",
    zoneName: "Plano PD Exchange Zone",
    zoneAddress: "909 14th St, Plano, TX 75074",
  };

  // 1 + 2. Buyer receipt and seller payout — this sender emits both.
  await sendTransactionCompleteEmails({
    buyer,
    seller,
    listing,
    money: {
      itemPriceCents: 1020,
      buyerFeeCents: 102,
      grossCapturedCents: 1122,
      sellerFeeCents: 102,
      payoutCents: 918,
    },
    orderId,
    transactionId: "7e11c3aa-2b90-4d55-8a17-6c0f9e2d3b41",
    meetupId: meetup.meetupId,
    meetup,
    metOn: "Tue, Aug 12, 2026",
    retailPriceCents: 5100,
    sellerIsFounding: false,
  });

  // 3. Buy request → seller.
  await sendNewRequestEmail({
    seller,
    buyer,
    listing,
    meetup,
    offeredPriceCents: 1020,
  });

  // 4. Refund → buyer only. Passing seller: null keeps this to one message.
  await sendRefundEmails({
    buyer,
    seller: null,
    listing,
    orderId,
    amountCents: 1122,
    reason: "cancelled",
  });

  console.log(`\nDone — 4 emails dispatched to ${to}.`);
  console.log("[email:sent] means Resend accepted it.");
  console.log(
    "[email:FALLBACK] means near-gear.com was rejected and mail went out from " +
      "onboarding@resend.dev instead — treat that as a DNS problem, not a pass.",
  );
}

void main();
