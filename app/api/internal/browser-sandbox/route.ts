import { Sandbox } from "@vercel/sandbox";
import { randomBytes } from "node:crypto";
import { getSql } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { parseBrowserRequest, validBrowserRequest } from "@/lib/browser-sandbox-client";
import { browserRuntimeImage } from "@/lib/browser-runtime-image";
import { BROWSER_SANDBOX_GATEWAY } from "@/lib/browser-sandbox-gateway";
export const runtime = "nodejs";
export const maxDuration = 90;
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

export async function POST(request: Request) {
  let sandbox: Sandbox | undefined;
  let lease: { id: string; runId: number } | undefined;
  try {
    const body = await request.text();
    if (body.length > 1000 || !validBrowserRequest(body, request.headers.get("x-preflight-browser") || ""))
      return Response.json({ error: "Unauthorized browser request." }, { status: 403, headers });
    const input = parseBrowserRequest(body);
    await ensureSchema();
    const sql = getSql();
    if (input.action === "close") {
      // Mark a pending allocation cancelled too: creation re-checks this lease.
      const rows = await sql`UPDATE browser_sandbox_sessions SET state='closed' WHERE id=${input.id}::uuid AND run_id=${input.runId} RETURNING sandbox_name`;
      const name = (rows as any[])[0]?.sandbox_name;
      if (name) { const existing = await Sandbox.get({ name, resume: false }); await existing.stop(); }
      return Response.json({ closed: true }, { headers });
    }
    const snapshotId = process.env.SANDBOX_BROWSER_SNAPSHOT_ID;
    if (!snapshotId) return Response.json({ error: "Isolated browser image is not configured." }, { status: 503, headers });
    const rows = await sql`INSERT INTO browser_sandbox_sessions(id,run_id,state)
      SELECT ${input.id}::uuid,id,'starting' FROM runs WHERE id=${input.runId} AND status='running'
      ON CONFLICT DO NOTHING RETURNING id`;
    if (!(rows as any[]).length) return Response.json({ error: "Browser request is no longer active or was already used." }, { status: 409, headers });
    lease = input;
    sandbox = await Sandbox.create({ name: `pf-browser-${input.id}`, source: { type: "snapshot", snapshotId: await browserRuntimeImage(snapshotId) },
      persistent: false, timeout: 600_000, resources: { vcpus: 1 }, ports: [9223], networkPolicy: "deny-all" });
    const token = randomBytes(32).toString("hex");
    await sandbox.writeFiles([{ path: "/vercel/sandbox/browser-gateway.cjs", content: Buffer.from(BROWSER_SANDBOX_GATEWAY) }]);
    await sandbox.runCommand({ cmd: "node", args: ["/vercel/sandbox/browser-gateway.cjs"], detached: true,
      env: { PREFLIGHT_BROWSER_TOKEN: token, PLAYWRIGHT_BROWSERS_PATH: "/vercel/sandbox/browsers" } });
    const ready = await sandbox.runCommand({ cmd: "bash", args: ["-c", "for i in {1..150}; do test -f /tmp/preflight-browser-ready && exit 0; sleep 0.1; done; exit 1"], timeoutMs: 20000 });
    if (ready.exitCode !== 0) throw new Error("Browser did not start.");
    const claimed = await sql`UPDATE browser_sandbox_sessions SET sandbox_name=${sandbox.name},state='ready'
      WHERE id=${input.id}::uuid AND state='starting' AND EXISTS(SELECT 1 FROM runs WHERE id=${input.runId} AND status='running') RETURNING id`;
    if (!(claimed as any[]).length) throw new Error("Browser request was cancelled.");
    return Response.json({ id: `sandbox:${input.runId}:${input.id}`, connectUrl: `${sandbox.domain(9223).replace(/^https:/, "wss:")}/cdp`,
      connectHeaders: { "x-preflight-browser-token": token } }, { headers });
  } catch {
    if (sandbox) await sandbox.stop().catch(() => {});
    if (lease) await getSql()`UPDATE browser_sandbox_sessions SET state='closed' WHERE id=${lease.id}::uuid AND run_id=${lease.runId}`.catch(() => {});
    return Response.json({ error: "Isolated browser allocation unavailable." }, { status: 503, headers });
  }
}
