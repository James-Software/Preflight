import { randomUUID } from "node:crypto";
import { get, del, list } from "@vercel/blob";
import { getSql } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { screenshotUrl } from "@/lib/evidence";
import { SITE_URL } from "@/lib/site";

function legacyScreenshot(raw: string, runId?: number) {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.search && !url.hash &&
      /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i.test(url.hostname) &&
      new RegExp(`^/preflight/runs/${runId === undefined ? "[0-9]+" : runId}/agent-[0-9]+-step-[0-9]+(?:-[a-zA-Z0-9]+)?\\.jpg$`).test(url.pathname);
  } catch { return false; }
}

async function readLegacyImage(url: string) {
  const blob = await get(url, { access: "public", useCache: false, abortSignal: AbortSignal.timeout(15_000) });
  if (!blob) return null; // The SDK distinguishes a missing object from auth/transport failures.
  if (blob.statusCode !== 200 || blob.blob.size > 2_097_152) throw new Error("Legacy image unavailable.");
  const reader = blob.stream.getReader();
  const chunks: Buffer[] = [];
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 2_097_152) throw new Error("Legacy image too large.");
      chunks.push(Buffer.from(chunk.value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  const image = Buffer.concat(chunks);
  if (image[0] !== 0xff || image[1] !== 0xd8 || image[2] !== 0xff) throw new Error("Unsupported legacy screenshot.");
  return image;
}

/** Preserve the image privately and durably queue deletion before retiring a URL.
 * Retries never lose evidence, repeat a migration, or forget a failed deletion. */
export async function privatizeLegacyScreenshots() {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`SELECT id,run_id,screenshot_url,created_at FROM findings
    WHERE screenshot_url LIKE 'https://%.public.blob.vercel-storage.com/preflight/runs/%'
    ORDER BY id LIMIT 10`;
  let migrated = 0, deleted = 0, failed = 0;
  const deadline = Date.now() + 240_000;
  for (const finding of rows as any[]) {
    if (Date.now() > deadline) break;
    if (!legacyScreenshot(finding.screenshot_url, finding.run_id)) { failed++; continue; }
    try {
      const image = await readLegacyImage(finding.screenshot_url);
      if (!image) {
        await sql`WITH missing AS (
          UPDATE findings SET screenshot_url=NULL WHERE id=${finding.id} AND screenshot_url=${finding.screenshot_url} RETURNING id
        ) INSERT INTO retired_screenshot_blobs(url,deleted_at) SELECT ${finding.screenshot_url},NOW() FROM missing ON CONFLICT(url) DO NOTHING`;
        deleted++;
        continue;
      }
      const id = randomUUID(), url = screenshotUrl(finding.run_id, id);
      const saved = await sql`WITH moved AS (
        UPDATE findings SET screenshot_url=${url} WHERE id=${finding.id} AND run_id=${finding.run_id}
          AND screenshot_url=${finding.screenshot_url} RETURNING run_id,created_at
      ), image AS (
        INSERT INTO run_screenshots(id,run_id,content,created_at)
          SELECT ${id}::uuid,run_id,decode(${image.toString("base64")},'base64'),created_at FROM moved RETURNING id
      ), retired AS (
        INSERT INTO retired_screenshot_blobs(url) SELECT ${finding.screenshot_url} FROM image
          ON CONFLICT(url) DO NOTHING RETURNING url
      ) SELECT id FROM image`;
      migrated += (saved as any[]).length;
    } catch { failed++; }
  }
  // Older failed finding inserts may have left public objects with no finding.
  // Scan only our screenshot prefix; preserve such images against their run
  // before retiring them, and remember pagination across scheduled deliveries.
  try {
    const state = await sql`SELECT cursor FROM screenshot_migration_state WHERE id='legacy-public'`;
    const cursor = (state as any[])[0]?.cursor || undefined;
    const page = await list({ prefix: "preflight/runs/", cursor, limit: 10, abortSignal: AbortSignal.timeout(15_000) });
    for (const blob of page.blobs) {
      if (Date.now() > deadline) break;
      if (!legacyScreenshot(blob.url)) { failed++; continue; }
      const runId = Number(new URL(blob.url).pathname.split("/")[3]);
      if (!Number.isSafeInteger(runId) || runId <= 0) { failed++; continue; }
      const inspection = await sql`SELECT EXISTS(SELECT 1 FROM runs WHERE id=${runId}) AS run_exists,
        EXISTS(SELECT 1 FROM findings WHERE screenshot_url=${blob.url}) AS referenced,
        EXISTS(SELECT 1 FROM retired_screenshot_blobs WHERE url=${blob.url}) AS retired`;
      const status = (inspection as any[])[0];
      if (!status || status.referenced || status.retired) continue;
      try {
        const image = await readLegacyImage(blob.url), id = randomUUID();
        if (!image) {
          await sql`INSERT INTO retired_screenshot_blobs(url,deleted_at) VALUES(${blob.url},NOW()) ON CONFLICT(url) DO NOTHING`;
          deleted++;
          continue;
        }
        if (!status.run_exists) {
          // An orphan without an identifiable owner stays in a private vault;
          // never assign its pixels to another project or leave them public.
          const saved = await sql`INSERT INTO retired_screenshot_blobs(url,private_content)
            VALUES(${blob.url},decode(${image.toString("base64")},'base64')) ON CONFLICT(url) DO NOTHING RETURNING url`;
          migrated += (saved as any[]).length;
          continue;
        }
        const saved = await sql`WITH retired AS (
          INSERT INTO retired_screenshot_blobs(url) SELECT ${blob.url} FROM runs r WHERE r.id=${runId}
            AND NOT EXISTS(SELECT 1 FROM findings f WHERE f.screenshot_url=${blob.url})
            ON CONFLICT(url) DO NOTHING RETURNING url
        ), image AS (
          INSERT INTO run_screenshots(id,run_id,content,created_at)
            SELECT ${id}::uuid,${runId},decode(${image.toString("base64")},'base64'),${blob.uploadedAt.toISOString()}::timestamptz FROM retired RETURNING id
        ) SELECT id FROM image`;
        migrated += (saved as any[]).length;
      } catch { failed++; }
    }
    await sql`INSERT INTO screenshot_migration_state(id,cursor,last_page_size,last_empty_at)
      VALUES('legacy-public',${page.hasMore ? page.cursor || null : null},${page.blobs.length},CASE WHEN ${!cursor && !page.blobs.length} THEN NOW() ELSE NULL END)
      ON CONFLICT(id) DO UPDATE SET cursor=EXCLUDED.cursor,last_page_size=EXCLUDED.last_page_size,last_empty_at=EXCLUDED.last_empty_at,updated_at=NOW()`;
  } catch { failed++; }
  const pending = await sql`SELECT url FROM retired_screenshot_blobs WHERE deleted_at IS NULL ORDER BY retired_at LIMIT 20`;
  for (const blob of pending as any[]) {
    if (Date.now() > deadline + 240_000) break;
    if (!legacyScreenshot(blob.url)) { failed++; continue; }
    try {
      await del(blob.url, { abortSignal: AbortSignal.timeout(10_000) });
      await sql`UPDATE retired_screenshot_blobs SET deleted_at=NOW() WHERE url=${blob.url}`;
      deleted++;
    } catch { failed++; }
  }
  await sql`UPDATE screenshot_migration_state SET last_failures=${failed} WHERE id='legacy-public'`;
  return { migrated, deleted, failed };
}

export async function expirePrivateScreenshots() {
  await ensureSchema();
  const rows = await getSql()`WITH expired AS (
    DELETE FROM run_screenshots s USING runs r,projects p
      WHERE s.run_id=r.id AND p.id=r.project_id
        AND s.created_at<NOW()-make_interval(days=>COALESCE(p.screenshot_retention_days,21))
      RETURNING s.id,s.run_id
  ), cleared AS (
    UPDATE findings f SET screenshot_url=NULL FROM expired e WHERE f.run_id=e.run_id
      AND f.screenshot_url=${SITE_URL + "/api/runs/"}||e.run_id::text||'/screenshots/'||e.id::text RETURNING f.id
  ) SELECT id FROM expired`;
  await getSql()`UPDATE retired_screenshot_blobs SET private_content=NULL
    WHERE private_content IS NOT NULL AND deleted_at IS NOT NULL AND retired_at<NOW()-INTERVAL '21 days'`;
  return (rows as any[]).length;
}
