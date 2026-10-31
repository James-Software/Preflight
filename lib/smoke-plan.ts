export type SmokeStep = { id: string; title: string; detail: string };

/** Discover user-facing navigation, not preload links or executable page data. */
export function discoverSmokeSteps(appUrl: string, html: string, coveredFormButtons: string[] = []): SmokeStep[] {
  const base = new URL(appUrl), links = new Set<string>();
  const document = html.replace(/<!--[^]*?-->|<script\b[^>]*>[^]*?<\/script\s*>|<style\b[^>]*>[^]*?<\/style\s*>/gi, "");
  for (const match of document.matchAll(/<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    try {
      const href = (match[1] ?? match[2] ?? match[3]).replaceAll("&amp;", "&");
      if (!href || href.startsWith("#")) continue;
      const target = new URL(href, base), path = decodeURIComponent(target.pathname);
      if (target.origin !== base.origin || target.username || target.password || target.pathname === base.pathname ||
        /^\/(?:_next|api|_vercel|cdn-cgi)(?:\/|$)/i.test(path) ||
        /\.(?:m?js|cjs|css|map|json|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|pdf|zip|xml|txt|mp4|webm)$/i.test(path)) continue;
      links.add(target.pathname);
      if (links.size >= 10) break;
    } catch { /* A malformed link is not a navigable page. */ }
  }
  const steps: SmokeStep[] = [...links].map(path => ({
    id: `visit-${path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root"}`,
    title: `Visit ${path}`, detail: `Navigate to ${path}; inspect the visible page, navigation and relevant console errors.`,
  }));
  const forms = [...document.matchAll(/<form\b[^>]*>[^]*?<\/form\s*>/gi)];
  forms.slice(0, 5).forEach((form, index) => {
    // An owner-configured database workflow executes this exact form separately
    // with stronger assertions. Do not schedule a duplicate unmarked write.
    const buttons = [...form[0].matchAll(/<button\b([^>]*)>([^]*?)<\/button\s*>/gi)].map(button => {
      const aria = button[1].match(/aria-label\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
      return (aria?.[1] || aria?.[2] || button[2].replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim().toLowerCase();
    });
    if (coveredFormButtons.some(label => buttons.includes(label.trim().toLowerCase()))) return;
    steps.push({
    id: `form-${index + 1}`, title: `Exercise form #${index + 1}`,
    detail: "Inspect the form and exercise validation. A valid create submission requires the supplied unique test marker. Check the visible outcome and independent persistence evidence when configured; a success toast alone does not establish a saved record.",
    });
  });
  return steps;
}
