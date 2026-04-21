import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const sb = createClient(url, anon);

console.log("Supabase URL:", url);
console.log("Acting as: anonymous (no session)\n");

// 1) listings INSERT as anonymous with seller_id: null
const { data: ins, error: insErr } = await sb
  .from("listings")
  .insert({
    title: "RLS probe — safe to delete",
    sport: "Other",
    category: "Other",
    condition: "good",
    price: 100,
    seller_id: null,
    status: "active",
  })
  .select("id")
  .single();

if (insErr) {
  console.log(`1) listings INSERT: BLOCKED`);
  console.log(`   code=${insErr.code} message=${insErr.message}\n`);
} else {
  console.log(`1) listings INSERT: ALLOWED (row id=${ins.id})\n`);
}

// 2) storage.objects INSERT on listings bucket as anonymous
const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
const path = `anonymous/rls-probe-${Date.now()}.png`;
const { error: upErr } = await sb.storage
  .from("listings")
  .upload(path, blob, { contentType: "image/png" });

if (upErr) {
  console.log(`2) storage upload to 'listings/${path}': BLOCKED`);
  console.log(`   message=${upErr.message}\n`);
} else {
  console.log(`2) storage upload to 'listings/${path}': ALLOWED\n`);
  // cleanup — may also be blocked, that's fine
  await sb.storage.from("listings").remove([path]);
}

// Summary
const anonPostWorks = !insErr && !upErr;
console.log("--------------------------------------------------");
console.log(
  anonPostWorks
    ? "RESULT: anonymous post flow SHOULD WORK end-to-end."
    : "RESULT: anonymous post flow WILL FAIL. Relax the blocked policies to test without auth."
);
