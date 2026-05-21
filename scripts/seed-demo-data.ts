/**
 * Seed the marketplace with 5 demo sellers and 18 listings.
 *
 * Idempotent: skips sellers whose email already exists and listings whose
 * (seller_id, title) pair already exists. Safe to re-run.
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

// ─── Photo pool ─────────────────────────────────────────────────────────
// Unsplash URLs verified working on the landing page, plus a few sport-
// themed adds. Photos are picked per-listing from the sport-keyed lists
// below; some repetition is acceptable for a demo seed.

const u = (id: string) =>
  `https://images.unsplash.com/${id}?w=1200&q=80&auto=format&fit=crop`;

const PHOTOS = {
  baseball: [
    u("photo-1531415074968-036ba1b575da"), // kids baseball game
    u("photo-1508344928928-7165b67de128"), // glove on grass
    u("photo-1626224583764-f87db24ac4ea"), // baseball bat
  ],
  softball: [
    u("photo-1531415074968-036ba1b575da"),
    u("photo-1517466787929-bc90951d0974"), // gear pile
  ],
  soccer: [
    u("photo-1574629810360-7efbbe195018"), // soccer ball
    u("photo-1606925797300-0b35e9d1794e"), // soccer cleats
    u("photo-1571019613454-1cb2f99b2d8b"), // team
  ],
  football: [
    u("photo-1577471488278-16eec37ffcc2"), // football helmet
    u("photo-1542291026-7eec264c27ff"), // sports storefront
    u("photo-1607734834519-d8576ae60ea7"), // football
  ],
  basketball: [
    u("photo-1486286701208-1d58e9338013"), // basketball
    u("photo-1551958219-acbc608c6377"), // basketball shoe
  ],
  volleyball: [
    u("photo-1610465299996-30f240ac2b1c"), // volleyball
    u("photo-1517466787929-bc90951d0974"),
  ],
  lacrosse: [
    u("photo-1547347298-4074fc3086f0"), // lacrosse
    u("photo-1535131749006-b7f58c99034b"), // sports field
  ],
  hockey: [
    u("photo-1515703407324-5f51c2c79bb1"), // hockey skates
    u("photo-1517466787929-bc90951d0974"),
  ],
} satisfies Record<string, string[]>;

// ─── Listings ───────────────────────────────────────────────────────────

type ConditionEnum = "like_new" | "good" | "fair" | "poor";

interface ListingSpec {
  seller: string;
  title: string;
  sport: keyof typeof PHOTOS;
  category: string;
  ageMin: number | null;
  ageMax: number | null;
  condition: ConditionEnum;
  priceCents: number;
  retailCents: number;
  description: string;
}

// excellent → good per schema (only like_new|good|fair|poor allowed).
const listings: ListingSpec[] = [
  // ─── Baseball / Softball (6) ───
  {
    seller: "demo.chen@neargear.com",
    title: "Rawlings Heart of the Hide 11.75\" Baseball Glove",
    sport: "baseball",
    category: "glove",
    ageMin: 11,
    ageMax: 14,
    condition: "good", // spec: excellent → good
    priceCents: 6500,
    retailCents: 24000,
    description:
      "Beautiful leather Rawlings glove, 11.75\". Broken in perfectly. My son outgrew it after one season. Excellent shape, no tears.",
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
  },

  // ─── Basketball (2) ───
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
  },
  {
    seller: "demo.chen@neargear.com",
    title: "Spalding NBA Youth Basketball — Size 5",
    sport: "basketball",
    category: "ball",
    ageMin: 9,
    ageMax: 11,
    condition: "good",
    priceCents: 1500,
    retailCents: 3500,
    description:
      "Official Spalding youth basketball, size 5. Like new, just rotated stock.",
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
  },
];

function pickPhotos(sport: keyof typeof PHOTOS, index: number): string[] {
  const pool = PHOTOS[sport];
  // Rotate through the pool by listing index so consecutive listings of the
  // same sport don't all show the same primary photo on the marketplace grid.
  return [pool[index % pool.length]!, pool[(index + 1) % pool.length]!];
}

// ─── Auth + profile helpers ─────────────────────────────────────────────

async function findUserByEmail(
  client: SupabaseClient,
  email: string,
): Promise<{ id: string } | null> {
  // listUsers paginates; we only have a handful, so first page is fine.
  const { data, error } = await client.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (error) throw error;
  const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  return match ? { id: match.id } : null;
}

async function ensureSeller(seller: Seller): Promise<string> {
  const existing = await findUserByEmail(supabase, seller.email);
  if (existing) {
    console.log(`  ↳ seller exists: ${seller.email}`);
    return existing.id;
  }

  // Random 32-byte password — never logged, never persisted.
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
  photoIndex: number,
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
    photo_urls: pickPhotos(spec.sport, photoIndex),
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
  // photoIndex counts per-sport so rotation stays stable across reruns.
  const photoIndexBySport = new Map<string, number>();
  for (const spec of listings) {
    const seller = sellerIdByEmail.get(spec.seller);
    if (!seller) throw new Error(`unknown seller email: ${spec.seller}`);
    const idx = photoIndexBySport.get(spec.sport) ?? 0;
    photoIndexBySport.set(spec.sport, idx + 1);
    const wasCreated = await ensureListing(spec, seller.id, seller.city, idx);
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
