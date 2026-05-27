import type { MetadataRoute } from "next";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const BASE_URL = "https://near-gear.com";

const STATIC_PAGES: Array<{
  route: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
}> = [
  { route: "", priority: 1.0, changeFrequency: "weekly" },
  { route: "/marketplace", priority: 0.9, changeFrequency: "daily" },
  { route: "/founding", priority: 0.8, changeFrequency: "weekly" },
  { route: "/auth/signup", priority: 0.7, changeFrequency: "monthly" },
  { route: "/auth/login", priority: 0.5, changeFrequency: "monthly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_PAGES.map((p) => ({
    url: `${BASE_URL}${p.route}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));

  // Active listings — fail closed (return static-only) so a Supabase blip
  // doesn't break sitemap generation entirely.
  try {
    const supabase = await createServerSupabaseClient();
    const { data: listings } = await supabase
      .from("listings")
      .select("id, created_at")
      .eq("status", "active");

    const listingEntries: MetadataRoute.Sitemap = (listings ?? []).map((l) => ({
      url: `${BASE_URL}/listings/${l.id}`,
      lastModified: l.created_at ? new Date(l.created_at) : now,
      changeFrequency: "daily" as const,
      priority: 0.6,
    }));

    return [...staticEntries, ...listingEntries];
  } catch {
    return staticEntries;
  }
}
