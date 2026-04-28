import { createBrowserClient } from "@supabase/ssr";

// Generated schema types live at src/types/database.gen.ts and can be opted
// into per-query: `supabase.from<...>("table")`. Keeping the default client
// untyped avoids a cascade of null-handling rewrites across the codebase
// (timestamp columns with DEFAULT NOW() are still typed `string | null`).

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return createBrowserClient(
      "https://placeholder.supabase.co",
      "placeholder-key",
    );
  }

  return createBrowserClient(url, key);
}
