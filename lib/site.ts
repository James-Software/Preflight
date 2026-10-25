export const SITE_URL = "https://www.trypreflight.dev";
export const SITE_DESCRIPTION = "Run AI agents through your app in real browsers. Review findings with screenshots, console logs and network traces.";
export const SITE_PREVIEW_IMAGE = {
  url: `${SITE_URL}/images/social-preview.png`,
  width: 1200,
  height: 631,
  alt: "PreFlight logo above sunlit clouds.",
};
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
