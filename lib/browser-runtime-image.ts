import { Sandbox } from "@vercel/sandbox";
import { getSql } from "@/lib/db";

/** Pin a short-lived setup snapshot before using it. Never snapshot a visited website. */
export async function browserRuntimeImage(sourceId: string): Promise<string> {
  const sql = getSql();
  const rows = await sql`SELECT pinned_snapshot_id FROM browser_runtime_images WHERE source_snapshot_id=${sourceId}`;
  if ((rows as any[])[0]) return (rows as any[])[0].pinned_snapshot_id;
  const clean = await Sandbox.create({ source: { type: "snapshot", snapshotId: sourceId },
    persistent: false, timeout: 120000, resources: { vcpus: 1 }, networkPolicy: "deny-all" });
  try {
    // This VM has never received a token, profile, target page or app credentials.
    const pinned = await clean.snapshot({ expiration: 0 });
    await sql`INSERT INTO browser_runtime_images(source_snapshot_id,pinned_snapshot_id) VALUES(${sourceId},${pinned.snapshotId}) ON CONFLICT DO NOTHING`;
    // Concurrent setup can create another clean image; each remains a valid runtime.
    return pinned.snapshotId;
  } finally { await clean.stop().catch(() => {}); }
}
