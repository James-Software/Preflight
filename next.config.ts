import type { NextConfig } from "next";
import { DISCOVERY_LINKS } from "./lib/site";

const nextConfig: NextConfig = {
  async headers() {
    return [
      ...["/robots.txt", "/sitemap.xml", "/llms.txt", "/llms-full.txt", "/auth.md", "/openapi.json", "/.well-known/api-catalog"].map(source => ({
        source, headers: [
          { key: "Link", value: DISCOVERY_LINKS },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      })),
      { source: "/auth.md", headers: [{ key: "Content-Type", value: "text/markdown; charset=utf-8" }] },
      { source: "/project-invite/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "Cache-Control", value: "private, no-store" }, { key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      ...["/dashboard/:path*", "/api/:path*", "/login", "/invite/:path*", "/access-denied"].map(source => ({
        source, headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      })),
    ];
  },
};

export default nextConfig;
