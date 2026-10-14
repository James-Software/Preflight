import { put } from "@vercel/blob";

/* Screenshot evidence goes to Vercel Blob (public URLs stored on findings).
   Requires BLOB_READ_WRITE_TOKEN in the runtime environment. */

export async function uploadScreenshot(
  runId: number,
  agentIndex: number,
  n: number,
  jpeg: Buffer
): Promise<string> {
  const blob = await put(
    `preflight/runs/${runId}/agent-${agentIndex}-step-${n}.jpg`,
    jpeg,
    { access: "public", contentType: "image/jpeg" }
  );
  return blob.url;
}
