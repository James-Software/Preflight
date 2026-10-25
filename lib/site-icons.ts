import { SITE_URL } from "@/lib/site";

export function appIconOrigin(appUrl: string | null) {
  try {
    const url = new URL(appUrl || "");
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}
export function isPreflightOrigin(origin: string) {
  return (
    new URL(origin).hostname.replace(/^www\./, "") ===
    new URL(SITE_URL).hostname.replace(/^www\./, "")
  );
}
function unescapeHtml(value: string) {
  return value.replace(
    /&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi,
    (entity) => {
      const named: Record<string, string> = {
        "&amp;": "&",
        "&quot;": '"',
        "&apos;": "'",
        "&lt;": "<",
        "&gt;": ">",
      };
      if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
      const hex = entity.toLowerCase().startsWith("&#x");
      const code = parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    },
  );
}
function attributes(tag: string) {
  const result: Record<string, string> = {};
  for (const match of tag.matchAll(
    /([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,
  )) {
    const name = match[1].toLowerCase();
    if (!(name in result))
      result[name] = unescapeHtml(match[2] ?? match[3] ?? match[4]);
  }
  return result;
}
function iconUrl(raw: string, base: string) {
  try {
    const url = new URL(raw, base);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function declaredSiteIcons(html: string, pageUrl: string): string[] {
  // Ignore commented markup and script strings that look like <link> elements.
  const markup = html.replace(
    /<!--[\s\S]*?(?:-->|$)|<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,
    "",
  );
  const baseTag = markup.match(/<base\b[^>]*>/i)?.[0];
  const base = baseTag
    ? iconUrl(attributes(baseTag).href || "", pageUrl) || pageUrl
    : pageUrl;
  const icons: { url: string; score: number }[] = [];
  for (const tag of markup.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = attributes(tag[0]);
    const rel = (attrs.rel || "").toLowerCase().split(/\s+/);
    if (
      !rel.some((r) =>
        ["icon", "apple-touch-icon", "apple-touch-icon-precomposed"].includes(
          r,
        ),
      )
    )
      continue;
    const url = attrs.href ? iconUrl(attrs.href, base) : null;
    if (!url) continue;
    const size = parseInt(attrs.sizes || "0", 10) || 0;
    icons.push({
      url,
      score:
        (rel.includes("icon") ? 1000 : 0) +
        (attrs.type === "image/svg+xml" || url.split("?")[0].endsWith(".svg")
          ? 512
          : Math.min(size, 256)),
    });
  }
  return [
    ...new Set(icons.sort((a, b) => b.score - a.score).map((i) => i.url)),
  ].slice(0, 8);
}
