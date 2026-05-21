/**
 * Seed the marketplace with 5 demo sellers and 25 listings across
 * baseball, softball, soccer, football, basketball, volleyball, lacrosse,
 * hockey, and golf.
 *
 * Idempotent: skips sellers whose email already exists and listings whose
 * (seller_id, title) pair already exists. Safe to re-run.
 *
 * Photos are real product photos sourced from SidelineSwap (sourced as
 * accurate stand-ins so the marketplace looks credible while we wait for
 * real listings).
 *
 * Auth passwords are generated at runtime — never committed or printed.
 * If a demo account is ever needed interactively, reset via Supabase Console.
 *
 * Run:
 *   npm run seed:demo
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

// ─── Sellers ────────────────────────────────────────────────────────────

interface Seller {
  email: string;
  full_name: string;
  city: string;
  zipcode: string;
  role: "parent" | "coach" | "both";
}

const sellers: Seller[] = [
  {
    email: "demo.morrison@neargear.com",
    full_name: "Jenny Morrison",
    city: "Frisco",
    zipcode: "75035",
    role: "parent",
  },
  {
    email: "demo.thompson@neargear.com",
    full_name: "Mike Thompson",
    city: "Plano",
    zipcode: "75024",
    role: "parent",
  },
  {
    email: "demo.chen@neargear.com",
    full_name: "Sarah Chen",
    city: "McKinney",
    zipcode: "75070",
    role: "parent",
  },
  {
    email: "demo.garcia@neargear.com",
    full_name: "Carlos Garcia",
    city: "Arlington",
    zipcode: "76001",
    role: "parent",
  },
  {
    email: "demo.patel@neargear.com",
    full_name: "Priya Patel",
    city: "Grapevine",
    zipcode: "76051",
    role: "parent",
  },
];

// ─── Listings ───────────────────────────────────────────────────────────

type ConditionEnum = "like_new" | "good" | "fair" | "poor";

interface ListingSpec {
  seller: string;
  title: string;
  sport: string;
  category: string;
  ageMin: number | null;
  ageMax: number | null;
  condition: ConditionEnum;
  priceCents: number;
  retailCents: number;
  description: string;
  photo: string;
}

const SS = (path: string) =>
  `https://edge.images.sidelineswap.com/production/${path}_original.jpeg`;
const SSP = (path: string) =>
  `https://edge.images.sidelineswap.com/production/${path}_original.png`;

// excellent → good per schema (only like_new|good|fair|poor allowed).
const listings: ListingSpec[] = [
  // ─── Baseball / Softball (8) ───
  {
    seller: "demo.chen@neargear.com",
    title: "Rawlings Heart of the Hide 11.75\" Baseball Glove",
    sport: "baseball",
    category: "glove",
    ageMin: 11,
    ageMax: 14,
    condition: "good",
    priceCents: 6500,
    retailCents: 24000,
    description:
      "Beautiful leather Rawlings glove, 11.75\". Broken in perfectly. My son outgrew it after one season. Excellent shape, no tears.",
    photo: SS("092/764/273/d0056db69c3f72d4"),
  },
  {
    seller: "demo.morrison@neargear.com",
    title: "Easton Ghost Fastpitch Softball Bat 30/20",
    sport: "softball",
    category: "bat",
    ageMin: 10,
    ageMax: 13,
    condition: "like_new",
    priceCents: 12500,
    retailCents: 29999,
    description:
      "Like new Easton Ghost, 30in/20oz. Only used one season. Sweet spot is incredible. USSSA approved.",
    photo: SS("089/825/103/78c17e4bc4d3615f"),
  },
  {
    seller: "demo.thompson@neargear.com",
    title: "Catcher's Gear Set — Helmet, Chest, Shin Guards (Youth Large)",
    sport: "baseball",
    category: "catchers gear",
    ageMin: 12,
    ageMax: 15,
    condition: "good",
    priceCents: 8500,
    retailCents: 25000,
    description:
      "Complete youth large catcher's set: helmet, chest protector, shin guards. Some wear from one season but plenty of life left.",
    photo: SS("092/383/829/61fa8b4e6c47dd51"),
  },
  {
    seller: "demo.patel@neargear.com",
    title: "Wilson A2000 First Base Mitt 12.25\"",
    sport: "baseball",
    category: "glove",
    ageMin: 13,
    ageMax: 18,
    condition: "good",
    priceCents: 9500,
    retailCents: 28000,
    description:
      "Wilson A2000 first base mitt, 12.25\". Broken in, great pocket. Selling because my daughter switched to pitcher.",
    photo: SS("088/387/161/3839a4c99ec89357"),
  },
  {
    seller: "demo.chen@neargear.com",
    title: "Marucci Cat 9 USSSA Baseball Bat 29/21",
    sport: "baseball",
    category: "bat",
    ageMin: 9,
    ageMax: 12,
    condition: "good",
    priceCents: 6500,
    retailCents: 25000,
    description:
      "Marucci Cat 9, 29in/21oz, USSSA approved. Used for one travel season. Solid bat at a fraction of retail.",
    photo: SS("083/537/976/8c968c769738447c"),
  },
  {
    seller: "demo.thompson@neargear.com",
    title: "Mizuno Franchise Baseball Cleats Size 5Y",
    sport: "baseball",
    category: "cleats",
    ageMin: 8,
    ageMax: 10,
    condition: "good",
    priceCents: 2500,
    retailCents: 6500,
    description:
      "Mizuno Franchise metal cleats, size 5Y. Worn one season. Excellent shape, no major scuffs.",
    photo: SS("068/329/595/ae3fed23ac3334d0"),
  },
  // ─── New baseball (3) ───
  {
    seller: "demo.thompson@neargear.com",
    title: "Easton Z5 Youth Batting Helmet",
    sport: "baseball",
    category: "helmet",
    ageMin: 8,
    ageMax: 12,
    condition: "like_new",
    priceCents: 2200,
    retailCents: 5500,
    description:
      "Easton Z5 youth batting helmet. Worn maybe 6 games. No cracks or major scuffs.",
    photo: SS("066/034/784/44ad6e38d80709d1"),
  },
  {
    seller: "demo.chen@neargear.com",
    title: "Louisville Slugger Youth Wood Baseball Bat",
    sport: "baseball",
    category: "bat",
    ageMin: 8,
    ageMax: 11,
    condition: "good",
    priceCents: 3500,
    retailCents: 8000,
    description:
      "Louisville Slugger wood bat, youth size. Couple of small dings but swings true. Great for backyard practice.",
    photo: SS("088/274/467/d963e0cad9bcfb99"),
  },
  {
    seller: "demo.patel@neargear.com",
    title: "Franklin Youth Batting Gloves (Pair)",
    sport: "baseball",
    category: "batting gloves",
    ageMin: 8,
    ageMax: 12,
    condition: "good",
    priceCents: 1200,
    retailCents: 2800,
    description:
      "Franklin youth batting gloves. Both gloves intact, palms still grippy. Just outgrew them.",
    photo: SS("082/341/770/4bce183b053b64fe"),
  },

  // ─── Soccer (4) ───
  {
    seller: "demo.morrison@neargear.com",
    title: "Adidas Predator Soccer Cleats — Youth Size 3",
    sport: "soccer",
    category: "cleats",
    ageMin: 7,
    ageMax: 9,
    condition: "like_new",
    priceCents: 3500,
    retailCents: 8500,
    description:
      "Adidas Predator cleats, youth size 3. Worn 4 times. Outgrew them too fast.",
    photo: SS("065/566/035/d82c9f5a590a7888"),
  },
  {
    seller: "demo.garcia@neargear.com",
    title: "Nike Mercurial Vapor Soccer Cleats Size 4Y",
    sport: "soccer",
    category: "cleats",
    ageMin: 9,
    ageMax: 11,
    condition: "good",
    priceCents: 2800,
    retailCents: 7000,
    description:
      "Nike Mercurial Vapor, size 4Y. One full season of practice and games. Lots of life left.",
    photo: SS("060/711/856/3118d65fa1aa2f0b"),
  },
  {
    seller: "demo.morrison@neargear.com",
    title: "Adidas Tiro Goalkeeper Gloves Youth Medium",
    sport: "soccer",
    category: "goalie gloves",
    ageMin: 10,
    ageMax: 13,
    condition: "good",
    priceCents: 1800,
    retailCents: 3500,
    description:
      "Adidas Tiro goalkeeper gloves, youth M. Daughter switched positions. Like-new condition.",
    photo: SS("083/312/837/903392e53aedbd9b"),
  },
  {
    seller: "demo.patel@neargear.com",
    title: "Adidas Soccer Shin Guards + Ankle Guards Set (Youth M)",
    sport: "soccer",
    category: "shin guards",
    ageMin: 8,
    ageMax: 12,
    condition: "good",
    priceCents: 1200,
    retailCents: 3000,
    description:
      "Adidas shin guards with ankle protection, youth M. Good condition, no cracks.",
    photo: SS("087/280/627/b62eb1fb8fcc7f13"),
  },

  // ─── Football (3) ───
  {
    seller: "demo.garcia@neargear.com",
    title: "Riddell Speed Icon Youth Football Helmet — Large",
    sport: "football",
    category: "helmet",
    ageMin: 12,
    ageMax: 14,
    condition: "good",
    priceCents: 12000,
    retailCents: 28000,
    description:
      "Riddell Speed Icon, youth large. Worn one season. NOCSAE certified, never in a major collision.",
    photo: SSP("089/676/712/500837396bff5c9c"),
  },
  {
    seller: "demo.thompson@neargear.com",
    title: "Schutt Shoulder Pads Youth Large",
    sport: "football",
    category: "shoulder pads",
    ageMin: 11,
    ageMax: 13,
    condition: "good",
    priceCents: 4500,
    retailCents: 12000,
    description:
      "Schutt shoulder pads, youth L. One season of use. Fit my son for two years.",
    photo: SS("077/180/862/26efac0a8992ebaa"),
  },
  {
    seller: "demo.garcia@neargear.com",
    title: "Nike Vapor Edge Football Cleats Size 6Y",
    sport: "football",
    category: "cleats",
    ageMin: 11,
    ageMax: 13,
    condition: "like_new",
    priceCents: 4000,
    retailCents: 8500,
    description:
      "Nike Vapor Edge, size 6Y. Bought for a tournament that got rained out. Tried on twice.",
    photo: SS("089/392/542/58a5942bb3982092"),
  },

  // ─── Basketball (1, was 2 — spalding dropped) ───
  {
    seller: "demo.thompson@neargear.com",
    title: "Nike Air Jordan Basketball Shoes Size 6Y",
    sport: "basketball",
    category: "shoes",
    ageMin: 11,
    ageMax: 13,
    condition: "good",
    priceCents: 5500,
    retailCents: 13000,
    description:
      "Nike Air Jordans, size 6Y. Worn for full season. Good tread, no major scuffs.",
    photo: SS("011/187/243/c7d9c2c803816aa1"),
  },

  // ─── Volleyball (1) ───
  {
    seller: "demo.patel@neargear.com",
    title: "Mizuno Wave Lightning Volleyball Shoes 6.5Y",
    sport: "volleyball",
    category: "shoes",
    ageMin: 12,
    ageMax: 14,
    condition: "good",
    priceCents: 3500,
    retailCents: 9500,
    description:
      "Mizuno Wave Lightning, size 6.5Y. One club season. Excellent grip still.",
    photo: SS("033/635/033/c697bf14930080b1"),
  },

  // ─── Lacrosse (1) ───
  {
    seller: "demo.morrison@neargear.com",
    title: "STX Stallion 200 Lacrosse Stick — Youth 37\"",
    sport: "lacrosse",
    category: "stick",
    ageMin: 9,
    ageMax: 12,
    condition: "fair",
    priceCents: 2500,
    retailCents: 7500,
    description:
      "STX Stallion lacrosse stick, youth 37\". Some wear and a small scuff on the shaft. Plays great still.",
    photo: SS("062/272/017/31a09db4e90c0c06"),
  },

  // ─── Hockey (1) ───
  {
    seller: "demo.garcia@neargear.com",
    title: "Bauer Vapor X3.7 Hockey Skates Youth 4",
    sport: "hockey",
    category: "skates",
    ageMin: 9,
    ageMax: 11,
    condition: "good",
    priceCents: 6500,
    retailCents: 20000,
    description:
      "Bauer Vapor X3.7, youth 4. Sharpened recently. Worn one season.",
    photo: SS("081/890/159/e0a68a9adf32c363"),
  },

  // ─── Golf (5, new sport) ───
  {
    seller: "demo.morrison@neargear.com",
    title: "Callaway XJ Junior Golf Set (Right-Hand)",
    sport: "golf",
    category: "club set",
    ageMin: 8,
    ageMax: 11,
    condition: "good",
    priceCents: 9500,
    retailCents: 22000,
    description:
      "Callaway XJ junior set: driver, fairway, irons, putter and stand bag. Right-hand. Two seasons of use, all clubs intact.",
    photo: SS("091/375/847/2579d4486597b4de"),
  },
  {
    seller: "demo.thompson@neargear.com",
    title: "TaylorMade Phenom Junior Golf Set",
    sport: "golf",
    category: "club set",
    ageMin: 10,
    ageMax: 13,
    condition: "like_new",
    priceCents: 12000,
    retailCents: 28000,
    description:
      "TaylorMade Phenom junior set. My son grew out of it after a year. Clubs look almost new.",
    photo: SS("089/006/290/31d4fdd3508f968a"),
  },
  {
    seller: "demo.patel@neargear.com",
    title: "PING G430 Driver",
    sport: "golf",
    category: "driver",
    ageMin: 14,
    ageMax: 18,
    condition: "good",
    priceCents: 22000,
    retailCents: 55000,
    description:
      "PING G430 driver, 10.5° loft, stiff flex. Some light scuffs on the sole but face is clean.",
    photo: SS("070/139/395/4389244509588173"),
  },
  {
    seller: "demo.chen@neargear.com",
    title: "Titleist Pro V1 Golf Balls — Dozen",
    sport: "golf",
    category: "balls",
    ageMin: 14,
    ageMax: 18,
    condition: "like_new",
    priceCents: 3500,
    retailCents: 5500,
    description:
      "Dozen Titleist Pro V1 balls. Found a sleeve unopened in my bag — just selling what I won't use.",
    photo: SS("007/070/751/4e432da32d62b107"),
  },
  {
    seller: "demo.garcia@neargear.com",
    title: "Junior Golf Stand Bag",
    sport: "golf",
    category: "bag",
    ageMin: 8,
    ageMax: 13,
    condition: "good",
    priceCents: 3500,
    retailCents: 9500,
    description:
      "Junior golf stand bag with rain cover. Has a small mark on the side panel but all zippers and straps work.",
    photo: SS("091/932/304/7dd47418e02a435d"),
  },
];

// ─── Auth + profile helpers ─────────────────────────────────────────────

async function findUserByEmail(
  client: SupabaseClient,
  email: string,
): Promise<{ id: string } | null> {
  const { data, error } = await client.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (error) throw error;
  const match = data.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  return match ? { id: match.id } : null;
}

async function ensureSeller(seller: Seller): Promise<string> {
  const existing = await findUserByEmail(supabase, seller.email);
  if (existing) {
    console.log(`  ↳ seller exists: ${seller.email}`);
    return existing.id;
  }

  const password = randomBytes(32).toString("base64url");
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email: seller.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: seller.full_name },
  });
  if (createErr || !created.user) {
    throw new Error(`createUser failed for ${seller.email}: ${createErr?.message}`);
  }

  const { error: profileErr } = await supabase.from("users").upsert(
    {
      id: created.user.id,
      email: seller.email,
      full_name: seller.full_name,
      role: seller.role,
      city: seller.city,
      zipcode: seller.zipcode,
    },
    { onConflict: "id" },
  );
  if (profileErr) {
    throw new Error(`profile insert failed for ${seller.email}: ${profileErr.message}`);
  }

  console.log(`  ✓ created seller: ${seller.email}`);
  return created.user.id;
}

async function ensureListing(
  spec: ListingSpec,
  sellerId: string,
  city: string,
): Promise<boolean> {
  const { data: existing, error: lookupErr } = await supabase
    .from("listings")
    .select("id")
    .eq("seller_id", sellerId)
    .eq("title", spec.title)
    .maybeSingle();
  if (lookupErr) throw lookupErr;
  if (existing) {
    console.log(`  ↳ listing exists: ${spec.title}`);
    return false;
  }

  const { error: insertErr } = await supabase.from("listings").insert({
    seller_id: sellerId,
    title: spec.title,
    sport: spec.sport,
    category: spec.category,
    condition: spec.condition,
    price: spec.priceCents,
    retail_price: spec.retailCents,
    description: spec.description,
    photo_urls: [spec.photo],
    status: "active",
    city,
    age_min: spec.ageMin,
    age_max: spec.ageMax,
  });
  if (insertErr) {
    throw new Error(`listing insert failed for "${spec.title}": ${insertErr.message}`);
  }
  console.log(`  ✓ created listing: ${spec.title}`);
  return true;
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log("Seeding demo data…\n");
  console.log("Sellers:");
  const sellerIdByEmail = new Map<string, { id: string; city: string }>();
  let sellersCreated = 0;
  for (const seller of sellers) {
    const before = await findUserByEmail(supabase, seller.email);
    const id = await ensureSeller(seller);
    if (!before) sellersCreated++;
    sellerIdByEmail.set(seller.email, { id, city: seller.city });
  }

  console.log("\nListings:");
  let listingsCreated = 0;
  for (const spec of listings) {
    const seller = sellerIdByEmail.get(spec.seller);
    if (!seller) throw new Error(`unknown seller email: ${spec.seller}`);
    const wasCreated = await ensureListing(spec, seller.id, seller.city);
    if (wasCreated) listingsCreated++;
  }

  console.log(
    `\nCreated ${sellersCreated} sellers, ${listingsCreated} listings.\n` +
      `View at https://near-gear.com/marketplace`,
  );
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
