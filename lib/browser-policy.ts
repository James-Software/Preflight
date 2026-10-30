import type { BrowserContext, Page } from "playwright-core";
import type { AgentAction } from "@/lib/models";
import { publicHttpUrl, publicHttpRequest, decodedPublicBody } from "@/lib/public-http";

export class BrowserPolicyError extends Error {}
const unsafe = /\b(?:delete|remove|destroy|drop|purge|truncate|edit|update|pay|purchase|buy|checkout|billing|transfer|withdraw|refund|invite|send|publish|install|connect|disconnect|revoke|logout|login|sign\s*(?:out|in|up)|log\s*(?:out|in)|password|credential|security|permission|admin|reset|unsubscribe|register|account|profile|settings|oauth|authorize)\b/i;
const unsafePath = /(?:^|[\W_])(?:delete|remove|destroy|drop|purge|truncate|edit|update|pay|purchase|checkout|billing|transfer|withdraw|refund|invite|send|publish|install|connect|disconnect|revoke|logout|signout|password|credential|security|permission|admin|reset|unsubscribe|register|signup|accounts?|profiles?|settings)(?:$|[\W_])/i;
const authWritePath = /(?:^|[\W_])(?:login|signin|oauth|authorize)(?:$|[\W_])/i;
const create = /\b(?:create|save|add|submit|join|subscribe|waitlist|done|finish|confirm)\b/i;

export function safeBrowserUrl(raw: string, origin: string) {
  try {
    const url = publicHttpUrl(raw);
    return url.origin === origin && !unsafePath.test(decodeURIComponent(url.pathname)) &&
      !Array.from(url.searchParams.entries()).some(([key, value]) => unsafePath.test(key) || /^(?:action|operation|intent|method)$/i.test(key) && unsafePath.test(value));
  } catch { return false; }
}

export function allowedBrowserAction(action: AgentAction, origin: string, markedCreate = false) {
  if (action.action === "goto") return safeBrowserUrl(action.value, origin);
  if (["done", "report_bug", "wait", "scroll"].includes(action.action)) return true;
  if (action.action === "fill") return !unsafe.test(action.name);
  if (action.action === "press") return ["Tab", "Shift+Tab", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(action.key) ||
    action.key === "Enter" && markedCreate && !unsafe.test(action.name);
  if (action.action === "click") {
    if (unsafe.test(action.name)) return false;
    // Unmarked create buttons may open a form. HTTP writes remain blocked.
    return ["link", "button", "tab", "checkbox", "radio", "combobox", "option", "menuitem", "switch"].includes(action.role.toLowerCase());
  }
  return false;
}

function containsMarker(body: string, marker: string) {
  let decoded = body;
  try { decoded = decodeURIComponent(body.replaceAll("+", " ")); } catch { /* Raw JSON/multipart bodies are already searchable. */ }
  return decoded.includes(marker) &&
    !/"(?:action|operation|intent|method)"\s*:\s*"(?:delete|remove|update|transfer|send|pay|publish|invite|reset|revoke)"/i.test(decoded) &&
    !/(?:^|[&\r\n])(?:action|operation|intent|method)=(?:delete|remove|update|transfer|send|pay|publish|invite|reset|revoke)(?:[&\r\n]|$)/i.test(decoded);
}

export function browserRequestAllowed(input: { url: string; method: string; navigation: boolean; body: string }, origin: string, marker?: string) {
  let url: URL;
  try { url = publicHttpUrl(input.url); } catch { return false; }
  const same = url.origin === origin;
  if (input.navigation && !same || same && !safeBrowserUrl(url.href, origin)) return false;
  if (["GET", "HEAD", "OPTIONS"].includes(input.method)) return true;
  return same && input.method === "POST" && !authWritePath.test(decodeURIComponent(url.pathname)) && !!marker && containsMarker(input.body, marker);
}

/** Every intercepted request is fulfilled through an IP-pinned public connection.
 * No browser DNS rebinding, redirect, service worker or websocket bypasses it. */
export function browserPolicy(options: { origin: string; assertActive: () => Promise<void>; headers?: Record<string, string>; readOnly?: boolean }) {
  let permit: { marker: string; until: number } | null = null;
  let blocked = "";
  let closed = false;
  const contexts = new Set<BrowserContext>();
  const controllers = new Set<AbortController>();
  const redirects = new WeakMap<object, number>();
  const deny = (reason: string) => { blocked ||= reason; };
  return {
    get blocked() { return blocked; },
    reset() { blocked = ""; permit = null; },
    permitCreate(marker: string | undefined, action: AgentAction) {
      permit = !options.readOnly && typeof marker === "string" && marker.startsWith("preflight-") &&
        (action.action === "click" && create.test(action.name) && !unsafe.test(action.name) || action.action === "press" && action.key === "Enter")
        ? { marker, until: Date.now() + 15_000 } : null;
    },
    async prepare(context: BrowserContext) {
      contexts.add(context);
      await context.routeWebSocket("**/*", socket => { socket.close(); });
      await context.route("**/*", async route => {
        const req = route.request();
        try {
          await options.assertActive();
          const marker = permit && permit.until > Date.now() ? permit.marker : undefined;
          if (closed || !browserRequestAllowed({ url: req.url(), method: req.method(), navigation: req.isNavigationRequest(), body: req.postData() || "" }, options.origin, marker)) {
            // Third-party background telemetry is not evidence of an app defect.
            const url = new URL(req.url());
            const telemetry = /^\/_vercel\/(?:insights|speed-insights)(?:\/|$)|^\/cdn-cgi\/rum$/.test(url.pathname);
            if (!telemetry && (url.origin === options.origin || req.isNavigationRequest())) deny("A request needed by this workflow was blocked by the test's action or origin policy.");
            await route.abort("blockedbyclient"); return;
          }
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 20_000);
          controllers.add(controller);
          try {
            const headers = await req.allHeaders();
            if (new URL(req.url()).origin === options.origin) Object.assign(headers, options.headers || {});
            const response = await publicHttpRequest(req.url(), { method: req.method(), headers, body: req.postDataBuffer(), signal: controller.signal, maxBytes: 8_388_608 });
            await options.assertActive();
            if (response.headers.refresh) throw new BrowserPolicyError("An automatic refresh redirect is outside the guarded navigation workflow.");
            // Preserve repeated Set-Cookie headers without ever forwarding them to another origin.
            const flattened = Object.fromEntries(Object.entries(response.headers).filter(([key]) => !/^(?:transfer-encoding|connection|content-length|content-encoding|refresh|location)$/i.test(key))
              .map(([key, value]) => [key, Array.isArray(value) ? value.join(key === "set-cookie" ? "\n" : ", ") : value]));
            if ([301, 302, 303, 307, 308].includes(response.status) && typeof response.headers.location === "string") {
              // Chromium does not consistently re-intercept an HTTP redirect
              // chain. Never hand a 3xx to it. A fresh same-origin GET navigation
              // goes through this IP-pinned boundary again, including cookies.
              const location = response.headers.location;
              const target = typeof location === "string" ? new URL(location, req.url()).href : "";
              if (!req.isNavigationRequest() || !safeBrowserUrl(target, options.origin) ||
                req.method() !== "GET" && response.status !== 303 && response.status !== 302)
                throw new BrowserPolicyError("The workflow redirected outside its permitted navigation scope.");
              const frame = req.frame(), count = (redirects.get(frame) || 0) + 1;
              if (count > 3) throw new BrowserPolicyError("The workflow exceeded its redirect limit.");
              redirects.set(frame, count);
              const destination = JSON.stringify(target).replaceAll("<", "\\u003c");
              await route.fulfill({ status: 200, headers: { ...flattened, "content-type": "text/html; charset=utf-8",
                "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
                "cache-control": "no-store" }, body: `<!doctype html><script>location.replace(${destination})</script>` });
              return;
            }
            if (req.isNavigationRequest()) redirects.delete(req.frame());
            await route.fulfill({ status: response.status, headers: flattened, body: decodedPublicBody(response, 8_388_608) });
          } finally { clearTimeout(timeout); controllers.delete(controller); }
        } catch {
          deny("The request could not complete within the public-network and active-run restrictions.");
          await route.abort("blockedbyclient").catch(() => {});
        }
      });
    },
    async checkAction(page: Page, action: AgentAction, markedCreate = false) {
      await options.assertActive();
      if (action.action !== "goto" && !safeBrowserUrl(page.url(), options.origin))
        throw new BrowserPolicyError("The browser is outside the configured app's permitted pages.");
      if (!allowedBrowserAction(action, options.origin, markedCreate)) throw new BrowserPolicyError("This action is outside the test's permitted scope. Destructive, payment and account/security changes are blocked.");
      if (action.action === "click" && action.role.toLowerCase() === "link") {
        const href = await page.getByRole("link", { name: action.name }).first().getAttribute("href");
        if (!href || !safeBrowserUrl(new URL(href, page.url()).href, options.origin)) throw new BrowserPolicyError("This link leaves the configured app or enters a restricted workflow.");
      }
    },
    async close() {
      closed = true;
      for (const controller of controllers) controller.abort();
      await Promise.allSettled([...contexts].map(context => context.close()));
      contexts.clear();
    },
  };
}
