import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { profileKey } from "@/lib/auth-profile-state";
import { SITE_URL } from "@/lib/site";

export function signBrowserRequest(body: string) {
  return createHmac("sha256", profileKey()).update(`preflight:browser-sandbox:v1\n${body}`).digest("hex");
}
export function validBrowserRequest(body: string, signature: string) {
  return /^[a-f0-9]{64}$/.test(signature) && timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(signBrowserRequest(body), "hex"));
}
export function parseBrowserRequest(body: string) {
  const input = JSON.parse(body);
  if (!input || !["create", "close"].includes(input.action) || !Number.isSafeInteger(input.runId) || input.runId < 1 ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.id || "") ||
    !Number.isFinite(input.timestamp) || Math.abs(Date.now() - input.timestamp) > 60_000) throw new Error("Invalid browser request.");
  return input as { action: "create" | "close"; runId: number; id: string; timestamp: number };
}
async function broker(action: "create" | "close", runId: number, id: string) {
  const body = JSON.stringify({ action, runId, id, timestamp: Date.now() });
  const response = await fetch(`${SITE_URL}/api/internal/browser-sandbox`, {
    method: "POST", signal: AbortSignal.timeout(action === "create" ? 75_000 : 20_000),
    headers: { "Content-Type": "application/json", "x-preflight-browser": signBrowserRequest(body) }, body,
  });
  if (!response.ok) throw new Error(`Isolated browser ${action} unavailable (HTTP ${response.status}).`);
  return response.json();
}
export async function createSandboxBrowser(runId: number) {
  const id = randomUUID();
  try { return await broker("create", runId, id) as { id: string; connectUrl: string; connectHeaders: Record<string,string> }; }
  catch (error) { await broker("close", runId, id).catch(() => {}); throw error; }
}
export async function closeSandboxBrowser(sessionId: string) {
  const [, runId, id] = sessionId.split(":");
  await broker("close", Number(runId), id);
}
