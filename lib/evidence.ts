import { randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { SITE_URL } from "@/lib/site";

export function screenshotUrl(runId: number, id: string) {
  return `${SITE_URL}/api/runs/${runId}/screenshots/${id}`;
}

// Evidence is private database content, never a public object URL. Every image
// request requires current project membership or an active run-scoped grant.
export async function uploadScreenshot(runId: number, _agentIndex: number, _step: number, jpeg: Buffer) {
  if (!Number.isSafeInteger(runId) || runId <= 0 || !jpeg.length || jpeg.length > 2_097_152 ||
    jpeg[0] !== 0xff || jpeg[1] !== 0xd8 || jpeg[2] !== 0xff)
    throw new Error("Unsupported screenshot.");
  await ensureSchema();
  const id = randomUUID();
  const rows = await getSql()`INSERT INTO run_screenshots(id,run_id,content)
    SELECT ${id}::uuid,r.id,decode(${jpeg.toString("base64")},'base64') FROM runs r
    WHERE r.id=${runId} AND r.status='running' RETURNING id`;
  if (!(rows as any[]).length) throw new Error("This run can no longer save screenshot evidence.");
  return screenshotUrl(runId, id);
}
