export const SITE_URL = "https://www.trypreflight.dev";
export const SITE_DESCRIPTION = "PreFlight sends a swarm of AI agents to test your app like real users. Every bug they find comes back as a fix.";
// Keep robots.txt and public response headers aligned on content-use preferences.
export const CONTENT_SIGNALS = "ai-train=yes, search=yes, ai-input=yes";

export function markdownPath(path: string): string {
  return path === "/" ? "/markdown" : `/markdown${path}`;
}

export function publicAlternates(path: string) {
  return {
    canonical: `${SITE_URL}${path}`,
    types: { "text/markdown": `${SITE_URL}${markdownPath(path)}` },
  };
}

export const DISCOVERY_LINKS = [
  `<${SITE_URL}/.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"`,
  `<${SITE_URL}/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"`,
  `<${SITE_URL}/llms.txt>; rel="describedby"; type="text/plain"`,
  `<${SITE_URL}/auth.md>; rel="help"; type="text/markdown"; title="Authentication instructions"`,
].join(", ");
