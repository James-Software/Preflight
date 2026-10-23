import { SITE_URL } from "./site";

/** Only return to an application page, never an external login callback. */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || /[\\\u0000-\u001f]/.test(value))
    return "/dashboard";
  try {
    const url = new URL(value, SITE_URL);
    if (
      url.origin !== new URL(SITE_URL).origin ||
      !/^\/dashboard(?:\/|$)/.test(url.pathname)
    )
      return "/dashboard";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/dashboard";
  }
}
