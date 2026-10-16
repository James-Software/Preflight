import { schedules } from "@trigger.dev/sdk";
import { del } from "@vercel/blob";
import { getSql } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";

/* ------------------------------------------------------------------ */
/* cleanup-screenshots — daily retention sweep for screenshot evidence. */
/* Finds findings whose screenshots are older than the project's       */
/* retention window (per-project override, else 21 days), permanently  */
/* deletes the image from Vercel Blob, and clears the URL on the       */
/* finding. Text evidence (severity, repro steps, logs) is never       */
/* touched. The clock runs from findings.created_at (capture time).    */
/*                                                                     */
/* Failure rule: if a Blob delete fails, the URL is KEPT so           */
/* tomorrow's run retries it. The DB and Blob are never left           */
/* inconsistent (no cleared URL pointing at a live object, and no      */
/* deleted object still referenced).                                   */
/* ------------------------------------------------------------------ */

const DEFAULT_RETENTION_DAYS = 21;

export const cleanupScreenshots = schedules.task({
  id: "cleanup-screenshots",
  // 11:00 UTC ≈ 3–4 AM PT, daily.
  cron: "0 11 * * *",
  maxDuration: 600,
  run: async () => {
    await ensureSchema();
    const sql = getSql();

    // Every finding with a screenshot older than its project's retention
    // window, resolved per project in a single query.
    const rows = await sql`
      SELECT f.id, f.screenshot_url, p.id AS project_id
      FROM findings f
      JOIN runs r ON r.id = f.run_id
      JOIN projects p ON p.id = r.project_id
      WHERE f.screenshot_url IS NOT NULL
        AND f.created_at < NOW() - make_interval(
          days => COALESCE(p.screenshot_retention_days, ${DEFAULT_RETENTION_DAYS})
        )
    `;
    if (!Array.isArray(rows)) {
      throw new Error("cleanup-screenshots: expired-findings query failed");
    }
    const findings = rows as {
      id: number;
      screenshot_url: string;
      project_id: number;
    }[];

    let deleted = 0;
    let failed = 0;
    for (const f of findings) {
      try {
        await del(f.screenshot_url);
        await sql`UPDATE findings SET screenshot_url = NULL WHERE id = ${f.id}`;
        deleted++;
      } catch (err) {
        // Keep the URL — tomorrow's run will retry this finding.
        console.error(
          `cleanup-screenshots: Blob delete failed for finding ${f.id} (${f.screenshot_url})`,
          err
        );
        failed++;
      }
    }

    const projectsScanned = new Set(findings.map((f) => f.project_id)).size;
    console.log(
      `cleanup-screenshots: ${projectsScanned} project(s), ` +
        `${findings.length} expired screenshot(s), deleted ${deleted}, failed ${failed}`
    );
    return {
      projectsScanned,
      expired: findings.length,
      deleted,
      failed,
    };
  },
});
