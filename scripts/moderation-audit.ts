/**
 * Run the real moderation classifier over live listings and report what it
 * would have decided. READ-ONLY — writes nothing.
 *
 *   npx tsx scripts/moderation-audit.ts            # all active listings
 *   npx tsx scripts/moderation-audit.ts --limit 3  # smoke test
 *
 * This is the audit that has to pass before enforcement goes live: if the
 * classifier would queue a meaningful share of the gear already on the site,
 * the triggers are wrong and the single admin becomes the bottleneck.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { classifyListing, type ModerationVerdict } from "../src/lib/moderation/classify";

config({ path: ".env.local" });

const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : undefined;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

type Row = {
  id: string;
  title: string;
  sport: string;
  category: string;
  price: number;
  description: string | null;
  photo_urls: string[];
  seller: { email: string } | null;
};

async function main() {
const { data, error } = await supabase
  .from("listings")
  .select("id, title, sport, category, price, description, photo_urls, seller:users!seller_id(email)")
  .eq("status", "active")
  .order("created_at");

if (error) {
  console.error("query failed:", error.message);
  process.exit(1);
}

const rows = ((data ?? []) as unknown as Row[]).slice(0, LIMIT ?? undefined);
console.log(`Classifying ${rows.length} active listing(s) with the real classifier…\n`);

const tally: Record<ModerationVerdict, number> = {
  allow: 0,
  review: 0,
  block: 0,
  error: 0,
};
const notable: string[] = [];
const started = Date.now();

for (const [i, r] of rows.entries()) {
  const isSeed = (r.seller?.email ?? "").startsWith("demo.");
  const res = await classifyListing({
    title: r.title ?? "",
    description: r.description ?? "",
    sport: r.sport ?? "",
    category: r.category ?? "",
    priceDollars: (r.price ?? 0) / 100,
    images: r.photo_urls ?? [],
  });

  tally[res.verdict] += 1;
  const flag =
    res.verdict === "allow" ? "  " : res.verdict === "review" ? "??" : "!!";
  console.log(
    `${flag} [${i + 1}/${rows.length}] ${res.verdict.padEnd(6)} ` +
      `conf=${res.confidence ?? "-"} src=${res.source.padEnd(9)} ` +
      `${isSeed ? "SEED" : "REAL"} | ${r.title}` +
      (res.reasons.length ? `\n        reasons: ${res.reasons.join(", ")}` : ""),
  );

  if (res.verdict !== "allow") {
    notable.push(
      `${res.verdict.toUpperCase()} — ${r.title} (${res.reasons.join(", ") || "no reasons"})`,
    );
  }
}

const secs = ((Date.now() - started) / 1000).toFixed(1);
const total = rows.length || 1;
console.log(`\n=== RESULT (${secs}s, ${(Number(secs) / total).toFixed(1)}s per listing) ===`);
for (const v of ["allow", "review", "block", "error"] as ModerationVerdict[]) {
  const pct = ((tally[v] / total) * 100).toFixed(1);
  console.log(`  ${v.padEnd(6)} ${String(tally[v]).padStart(3)}  ${pct}%`);
}
console.log(
  `\n  REVIEW RATE: ${(((tally.review + tally.block) / total) * 100).toFixed(1)}% ` +
    `(target: under 10% on legitimate gear)`,
);
if (notable.length) {
  console.log("\n=== not auto-approved ===");
  for (const n of notable) console.log(`  ${n}`);
}
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
