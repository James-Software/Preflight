/** Keep user-authored titles/descriptions from closing a JSON-LD script tag. */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
