/**
 * Behavioural test for the moderation gate.
 *
 *   npx tsx scripts/moderation-cases.ts
 *
 * The deterministic prescreen cases are free and run every time. The model
 * cases cost a call each and reuse a real listing photo from storage, so the
 * vision half is genuinely exercised rather than stubbed.
 */
import { config } from "dotenv";
import { prescreen, classifyListing } from "../src/lib/moderation/classify";

config({ path: ".env.local" });

// A real glove photo already in our storage bucket. Pairing it with wrong text
// is how we test the photo-vs-text cases honestly.
const GLOVE_PHOTO =
  "https://rbqqmzdtzrxvmtxgqesd.supabase.co/storage/v1/object/public/listings/" +
  "4016e84f-f0db-4901-af61-2cf52b6e5a39/1777492705401-90y1k4.png";

type Case = {
  name: string;
  title: string;
  description: string;
  price?: number;
  category?: string;
  expect: "allow" | "review" | "block";
};

const PRESCREEN_CASES: Case[] = [
  { name: "ordinary glove", title: "Rawlings 11.5\" Youth Glove", description: "Good condition, used one season.", expect: "allow" },
  { name: "weapon", title: "Youth baseball bat and a Glock 19", description: "Bundle deal.", expect: "block" },
  { name: "airsoft", title: "Airsoft rifle", description: "Barely used.", expect: "block" },
  { name: "adult", title: "Team jersey and lingerie set", description: "n/a", expect: "block" },
  { name: "vape", title: "Soccer cleats + vape pen", description: "Selling together.", expect: "block" },
  { name: "phone", title: "iPhone 14 Pro", description: "Unlocked, 256GB.", expect: "review" },
  { name: "couch", title: "Sectional sofa", description: "Moving sale.", expect: "review" },
  { name: "graded card", title: "1989 Griffey Upper Deck PSA 9", description: "Graded gem.", price: 60, expect: "review" },
  { name: "raw card over cap", title: "Topps rookie card lot", description: "Mixed lot.", price: 250, expect: "review" },
  { name: "raw card under cap", title: "Topps rookie card lot", description: "Mixed lot.", price: 40, expect: "allow" },
  // Guards against the gate being too WIDE — these must never queue.
  { name: "bad grammar", title: "glove good condishun cheep", description: "kid outgrew it", expect: "allow" },
  { name: "vague title", title: "Bat", description: "28 inch.", expect: "allow" },
  { name: "the word 'card' alone", title: "Bat with grip tape and score card", description: "Scorebook included.", expect: "allow" },
];

const MODEL_CASES: Case[] = [
  { name: "glove photo, glove title", title: "Rawlings Youth Baseball Glove", description: "11.5 inch, good shape.", expect: "allow" },
  { name: "glove photo, WRONG BRAND title", title: "Wilson A2000 Glove", description: "Great condition.", expect: "allow" },
  { name: "glove photo, laptop title", title: "MacBook Pro 16 inch", description: "M3, 512GB SSD, boxed.", expect: "review" },
];

async function main() {
  let pass = 0;
  let fail = 0;
  const report = (name: string, got: string, want: string, extra = "") => {
    const ok = got === want;
    ok ? pass++ : fail++;
    console.log(
      `  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(30)} got=${got.padEnd(6)} want=${want}${extra}`,
    );
  };

  console.log("=== deterministic prescreen (free, no API call) ===");
  for (const c of PRESCREEN_CASES) {
    const r = prescreen({
      title: c.title,
      description: c.description,
      sport: "Baseball",
      category: c.category ?? "Other",
      priceDollars: c.price ?? 25,
      images: [],
    });
    // A null prescreen verdict means "no opinion, ask the model" — which for
    // these text-only cases is the same outcome as allow.
    report(c.name, r.verdict ?? "allow", c.expect,
      r.reasons.length ? `  [${r.reasons.join(",")}]` : "");
  }

  console.log("\n=== model pass (real photo + vision) ===");
  for (const c of MODEL_CASES) {
    const r = await classifyListing({
      title: c.title,
      description: c.description,
      sport: "Baseball",
      category: "Glove",
      priceDollars: c.price ?? 25,
      images: [GLOVE_PHOTO],
    });
    report(c.name, r.verdict, c.expect,
      `  src=${r.source}${r.reasons.length ? ` [${r.reasons.join(",")}]` : ""}`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
