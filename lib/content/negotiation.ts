/** Only explicit Markdown requests can change a public HTML representation. */
export function prefersMarkdown(accept: string | null): boolean {
  const ranges = (accept ?? "").split(",").map(part => {
    const [type, ...parameters] = part.trim().toLowerCase().split(";");
    const quality = parameters.map(value => value.trim()).find(value => value.startsWith("q="));
    const q = quality ? Number(quality.slice(2)) : 1;
    return { type: type.trim(), q: Number.isFinite(q) && q >= 0 && q <= 1 ? q : 0 };
  });
  const quality = (type: string) => Math.max(-1, ...ranges.filter(range => range.type === type).map(range => range.q));
  const markdown = quality("text/markdown");
  if (markdown <= 0) return false;
  const html = quality("text/html");
  if (html >= 0) return markdown > html; // Prefer HTML for an explicit tie.
  const textWildcard = quality("text/*");
  const wildcard = textWildcard >= 0 ? textWildcard : Math.max(quality("*/*"), 0);
  return markdown >= wildcard;
}
