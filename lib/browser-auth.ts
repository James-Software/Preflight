import type { Browser } from "playwright-core";
import type { getRunAuthentication } from "@/lib/auth-profiles";

export async function authenticatedPage(
  browser: Browser,
  authentication: Awaited<ReturnType<typeof getRunAuthentication>>,
) {
  const { state, origin } = authentication;
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    storageState: { cookies: state.cookies, origins: state.origins },
    serviceWorkers: "block",
  });
  if (Object.keys(state.headers).length)
    await context.route("**/*", async (route) => {
      // Never apply a profile header to third-party resources or redirect destinations.
      const headers = { ...route.request().headers() };
      if (new URL(route.request().url()).origin === origin)
        Object.assign(headers, state.headers);
      // A fresh request per redirect prevents Playwright's header overrides following it cross-origin.
      if (new URL(route.request().url()).origin === origin) {
        const response = await route.fetch({ headers, maxRedirects: 0 });
        await route.fulfill({ response });
      } else await route.continue();
    });
  const page = await context.newPage();
  let reason = "The signed-in page did not finish loading.";
  try {
    const response = await page.goto(
      new URL(authentication.verification_path, origin).href,
      { waitUntil: "domcontentloaded", timeout: 25_000 },
    );
    const url = new URL(page.url());
    if (!response) {
      reason = "The signed-in page returned no response.";
      throw new Error();
    }
    if (response.status() >= 400) {
      reason = `The signed-in page returned HTTP ${response.status()}.`;
      throw new Error();
    }
    if (url.origin !== origin) {
      reason = "The signed-in page redirected to a different origin.";
      throw new Error();
    }
    if (/\/(?:log-?in|sign-?in)(?:\/|$)/i.test(url.pathname)) {
      reason = "The app redirected to its sign-in page.";
      throw new Error();
    }
    if (await page.locator('input[type="password"]').first().isVisible()) {
      reason = "The verification page displayed a password form.";
      throw new Error();
    }
    if (authentication.verification_text) {
      reason = "The configured signed-in text was not found.";
      await page
        .getByText(authentication.verification_text, { exact: false })
        .first()
        .waitFor({ state: "visible", timeout: 10_000 });
    }
  } catch {
    await context.close().catch(() => {});
    throw new Error(
      `Authentication check failed. ${reason} Check the saved profile’s session, signed-in page and text marker. This is a setup failure, not an app finding.`,
    );
  }
  return page;
}
export function profileRedactor(
  authentication: Awaited<ReturnType<typeof getRunAuthentication>>,
) {
  const values = [
    ...authentication.state.cookies.map((c) => c.value),
    ...Object.values(authentication.state.headers),
    ...authentication.state.origins.flatMap((o) =>
      o.localStorage
        .filter(
          (v) =>
            /token|auth|session|secret|credential/i.test(v.name) ||
            v.value.length >= 16,
        )
        .map((v) => v.value),
    ),
  ];
  // Auth libraries often keep token objects as JSON in local storage.
  const nested = (value: unknown, depth = 0): string[] => {
    if (depth > 8 || value == null) return [];
    if (typeof value === "string") return [value];
    if (typeof value === "object")
      return Object.entries(value).flatMap(([name, item]) =>
        typeof item === "string"
          ? /token|secret|password|authorization|credential|api_key|refresh|session/i.test(
              name,
            )
            ? [item]
            : []
          : nested(item, depth + 1),
      );
    return [];
  };
  const expanded = values.flatMap((value) => {
    try {
      return [value, ...nested(JSON.parse(value))];
    } catch {
      return [value];
    }
  });
  const secrets = [
    ...new Set(
      expanded
        .flatMap((value) => [
          value,
          ...(/^(Bearer|Basic)\s+/i.test(value)
            ? [value.replace(/^(Bearer|Basic)\s+/i, "")]
            : []),
        ])
        .filter((value) => value.length >= 4),
    ),
  ].sort((a, b) => b.length - a.length);
  return (text: string) =>
    secrets.reduce(
      (value, secret) => value.split(secret).join("[redacted]"),
      text,
    );
}
