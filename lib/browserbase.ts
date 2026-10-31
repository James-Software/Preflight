import { createSandboxBrowser, closeSandboxBrowser } from "@/lib/browser-sandbox-client";
/* ------------------------------------------------------------------ */
/* Browserbase: real cloud browsers. Sessions are created per agent and  */
/* always closed in a finally block. Playwright connects over CDP.       */
/* ------------------------------------------------------------------ */

const BB_API = "https://api.browserbase.com/v1/sessions";

export type BrowserSession = {
  id: string;
  connectUrl: string;
  connectHeaders?: Record<string, string>;
};

function bbKey(): string {
  const k = process.env.BROWSERBASE_API_KEY;
  if (!k) throw new Error("BROWSERBASE_API_KEY is not set");
  return k;
}

export async function createBrowserSession(
  privateSession = false,
  interactive = false,
  timeoutSeconds = 600,
  context?: { runId: number },
): Promise<BrowserSession> {
  const key = bbKey();
  const body: Record<string, unknown> = {};
  if (interactive)
    Object.assign(body, {
      keepAlive: true,
      timeout: Math.max(60, Math.min(600, Math.floor(timeoutSeconds))),
    });
  if (privateSession)
    body.browserSettings = { recordSession: false, logSession: false };
  if (process.env.BROWSERBASE_PROJECT_ID) {
    body.projectId = process.env.BROWSERBASE_PROJECT_ID;
  }
  const res = await fetch(BB_API, {
    signal: AbortSignal.timeout(15_000),
    method: "POST",
    headers: { "x-bb-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (!interactive && context && [402, 429, 503].includes(res.status)) return createSandboxBrowser(context.runId);
    const t = await res.text().catch(() => "");
    throw new Error(
      `Browserbase session error ${res.status}: ${t.slice(0, 200)}`,
    );
  }
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error("Browserbase returned no session id");
  return {
    id: data.id,
    connectUrl: `wss://connect.browserbase.com?apiKey=${key}&sessionId=${data.id}`,
  };
}

export async function closeBrowserSession(sessionId: string): Promise<void> {
  if (sessionId.startsWith("sandbox:")) return closeSandboxBrowser(sessionId);
  const res = await fetch(`${BB_API}/${sessionId}`, {
    signal: AbortSignal.timeout(10_000),
    method: "POST",
    headers: { "x-bb-api-key": bbKey(), "Content-Type": "application/json" },
    body: JSON.stringify({
      status: "REQUEST_RELEASE",
      ...(process.env.BROWSERBASE_PROJECT_ID
        ? { projectId: process.env.BROWSERBASE_PROJECT_ID }
        : {}),
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(
      `Browserbase close error ${res.status}: ${t.slice(0, 200)}`,
    );
  }
}

// The CDP endpoint is server-only: it contains the Browserbase API key.
export function browserConnectUrl(sessionId: string) {
  return `wss://connect.browserbase.com?apiKey=${encodeURIComponent(bbKey())}&sessionId=${encodeURIComponent(sessionId)}`;
}
export async function browserLiveUrl(sessionId: string) {
  const response = await fetch(
    `${BB_API}/${encodeURIComponent(sessionId)}/debug`,
    {
      signal: AbortSignal.timeout(10_000),
      headers: { "x-bb-api-key": bbKey() },
      cache: "no-store",
    },
  );
  if (!response.ok) throw new Error("Could not open interactive browser");
  const data = await response.json();
  const url = new URL(data.debuggerFullscreenUrl);
  if (
    url.protocol !== "https:" ||
    !(
      url.hostname === "browserbase.com" ||
      url.hostname.endsWith(".browserbase.com")
    )
  )
    throw new Error("Unexpected interactive browser URL");
  return url.href;
}
