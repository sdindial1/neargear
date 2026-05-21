/**
 * Remove all demo data created by seed-demo-data.ts:
 *   1. delete listings owned by any demo.*@neargear.com seller
 *   2. delete the public.users rows
 *   3. delete the auth.users entries
 *
 * Safe to run any time — does nothing if no demo accounts exist.
 *
 * Run:
 *   npm run clean:demo
 */

import { createClient } from "@supabase/supabase-js";
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

const DEMO_EMAIL_PATTERN = /^demo\..+@neargear\.com$/i;

async function main() {
  console.log("Cleaning demo data…\n");

  // 1. find demo auth users (we use the auth list as source of truth)
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) throw listErr;
  const demoUsers = list.users.filter(
    (u) => u.email && DEMO_EMAIL_PATTERN.test(u.email),
  );
  if (demoUsers.length === 0) {
    console.log("No demo accounts found. Nothing to clean.");
    return;
  }
  console.log(`Found ${demoUsers.length} demo accounts.`);

  const demoIds = demoUsers.map((u) => u.id);

  // 2. delete listings owned by demos (ON DELETE CASCADE from auth.users
  //    handles this too via the public.users FK, but we delete explicitly
  //    so the log line is meaningful).
  const { data: listingsDeleted, error: lDelErr } = await supabase
    .from("listings")
    .delete()
    .in("seller_id", demoIds)
    .select("id");
  if (lDelErr) throw lDelErr;
  console.log(`  ✓ deleted ${listingsDeleted?.length ?? 0} listings`);

  // 3. delete auth users — this cascades the public.users row via the FK.
  let deletedUsers = 0;
  for (const u of demoUsers) {
    const { error } = await supabase.auth.admin.deleteUser(u.id);
    if (error) {
      console.warn(`  ! failed to delete ${u.email}: ${error.message}`);
      continue;
    }
    deletedUsers++;
    console.log(`  ✓ deleted user: ${u.email}`);
  }

  console.log(
    `\nRemoved ${deletedUsers} sellers and ${listingsDeleted?.length ?? 0} listings.`,
  );
}

main().catch((err) => {
  console.error("Clean failed:", err);
  process.exit(1);
});
