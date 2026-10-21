import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/api", "/login", "/invite", "/access-denied"],
    },
    sitemap: "https://www.trypreflight.dev/sitemap.xml",
  };
}
