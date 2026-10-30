import type { MetadataRoute } from "next";
import { CONTENT_SIGNALS, SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/api", "/login", "/invite", "/project-invite", "/demo", "/access-denied"],
      other: { "Content-Signal": CONTENT_SIGNALS },
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
