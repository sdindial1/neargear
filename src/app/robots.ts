import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/api/",
        "/auth/callback",
        "/profile/",
        "/meetups/",
        "/messages",
        "/messages/",
        "/saved",
      ],
    },
    sitemap: "https://near-gear.com/sitemap.xml",
  };
}
