import { getSql } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";

export interface FixGroup {
  id: string;
  run_id: number;
  finding_ids: number[];
  branch: string;
  state: string;
  pr_url: string | null;
  pr_number: number | null;
}

export class FixActionError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}

export function parseFindingIds(value: unknown): number[] {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > 100 ||
    value.some((id) => !Number.isSafeInteger(id) || id <= 0)
  ) {
    throw new FixActionError("Select between 1 and 100 findings.", 400);
  }
  return [...new Set(value)].sort((a, b) => a - b);
}

/** A durable reservation prevents overlapping groups, including concurrent requests. */
export async function reserveFixGroup(
  owner: string,
  projectId: number,
  runId: number,
  ids: number[],
  key: string,
): Promise<FixGroup> {
  await ensureSchema();
  const sql = getSql();
  const branch = `preflight/run-${runId}-${key}`;
  await sql`
    INSERT INTO fix_pr_groups (id, run_id, finding_ids, branch)
    SELECT ${key}::uuid, r.id, ${JSON.stringify(ids)}::jsonb, ${branch}
    FROM runs r JOIN projects p ON p.id = r.project_id
    WHERE r.id = ${runId} AND p.id = ${projectId} AND p.owner_github_id = ${owner}
    ON CONFLICT (id) DO NOTHING
  `;
  const rows = await sql`
    SELECT g.* FROM fix_pr_groups g JOIN runs r ON r.id = g.run_id
    JOIN projects p ON p.id = r.project_id
    WHERE g.id = ${key}::uuid AND r.id = ${runId} AND p.id = ${projectId} AND p.owner_github_id = ${owner}
  `;
  const group = Array.isArray(rows)
    ? (rows[0] as FixGroup | undefined)
    : undefined;
  if (!group || JSON.stringify(group.finding_ids) !== JSON.stringify(ids))
    throw new FixActionError("This PR group does not match the selection.");
  if (group.state === "open") return group;
  const claimed = await sql`
    WITH candidates AS MATERIALIZED (
      SELECT f.id FROM findings f JOIN diagnoses d ON d.finding_id = f.id
      WHERE f.run_id = ${runId} AND f.id = ANY(${ids}::int[])
        AND f.deleted_at IS NULL AND NULLIF(TRIM(d.patch_diff), '') IS NOT NULL
        AND (f.pr_group_id IS NULL OR f.pr_group_id = ${key}::uuid)
        AND NOT EXISTS (SELECT 1 FROM pull_requests pr WHERE pr.diagnosis_id = d.id)
      ORDER BY f.id FOR UPDATE OF f
    )
    UPDATE findings SET pr_group_id = ${key}::uuid
    WHERE id IN (SELECT id FROM candidates)
      AND (SELECT COUNT(*) FROM candidates) = ${ids.length}
      AND (pr_group_id IS NULL OR pr_group_id = ${key}::uuid) AND deleted_at IS NULL
    RETURNING id
  `;
  if (!Array.isArray(claimed) || claimed.length !== ids.length)
    throw new FixActionError(
      "Some findings are unavailable, already grouped, or do not have a proposed fix. Refresh the report.",
    );
  return group;
}

export async function completeFixGroup(
  key: string,
  url: string,
  number: number,
): Promise<void> {
  await getSql()`UPDATE fix_pr_groups SET state = 'open', pr_url = ${url}, pr_number = ${number} WHERE id = ${key}::uuid`;
}

export async function releaseInvalidFixGroup(key: string): Promise<void> {
  await getSql()`UPDATE findings SET pr_group_id = NULL WHERE pr_group_id = ${key}::uuid
    AND EXISTS (SELECT 1 FROM fix_pr_groups g WHERE g.id = ${key}::uuid AND g.state = 'pending')`;
}

/** Only one request may build a group at a time; crashed requests expire. */
export async function acquireFixGroup(key: string): Promise<void> {
  const rows =
    await getSql()`UPDATE fix_pr_groups SET lease_until = NOW() + INTERVAL '330 seconds'
    WHERE id = ${key}::uuid AND state = 'pending' AND (lease_until IS NULL OR lease_until < NOW()) RETURNING id`;
  if (!Array.isArray(rows) || !rows.length)
    throw new FixActionError(
      "This PR group is already being opened. Refresh shortly, then resume if needed.",
    );
}

export async function releaseFixGroupLease(key: string): Promise<void> {
  await getSql()`UPDATE fix_pr_groups SET lease_until = NULL WHERE id = ${key}::uuid`;
}

/** Soft deletion keeps diagnosis/PR history and never closes a GitHub PR. */
export async function deleteFindings(
  owner: string,
  projectId: number,
  runId: number,
  ids: number[],
): Promise<void> {
  await ensureSchema();
  const rows = await getSql()`
    WITH candidates AS MATERIALIZED (
      SELECT f.id FROM findings f JOIN runs r ON r.id = f.run_id
      JOIN projects p ON p.id = r.project_id
      LEFT JOIN fix_pr_groups g ON g.id = f.pr_group_id
      WHERE r.id = ${runId} AND p.id = ${projectId} AND p.owner_github_id = ${owner}
        AND f.id = ANY(${ids}::int[]) AND f.deleted_at IS NULL
        AND (f.pr_group_id IS NULL OR g.state = 'open')
      ORDER BY f.id FOR UPDATE OF f
    )
    UPDATE findings SET deleted_at = NOW()
    WHERE id IN (SELECT id FROM candidates) AND (SELECT COUNT(*) FROM candidates) = ${ids.length}
      AND deleted_at IS NULL
      AND (pr_group_id IS NULL OR EXISTS (SELECT 1 FROM fix_pr_groups g WHERE g.id = findings.pr_group_id AND g.state = 'open'))
    RETURNING id
  `;
  if (!Array.isArray(rows) || rows.length !== ids.length)
    throw new FixActionError(
      "Some findings are unavailable or have a PR in progress. Refresh and try again.",
    );
}
