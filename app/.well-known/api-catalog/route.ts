import { SITE_URL } from "@/lib/site";

/** RFC 9727 API catalog, expressed as an RFC 9264 JSON linkset. */
export function GET() {
  return Response.json({ linkset: [
    { anchor: `${SITE_URL}/.well-known/api-catalog`, item: [
      { href: `${SITE_URL}/markdown`, type: "text/markdown", title: "PreFlight public content" },
    ] },
    { anchor: `${SITE_URL}/markdown`,
      "service-desc": [{ href: `${SITE_URL}/openapi.json`, type: "application/vnd.oai.openapi+json" }],
      "service-doc": [{ href: `${SITE_URL}/llms.txt`, type: "text/plain" }],
      help: [{ href: `${SITE_URL}/auth.md`, type: "text/markdown" }],
    },
  ] }, { headers: { "Content-Type": "application/linkset+json", "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
}
