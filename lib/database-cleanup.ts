import { getSql } from "@/lib/db";
import { runDatabaseConfig } from "@/lib/database-connections";
import { DatabaseCheckError } from "@/lib/database-check-config";
import { postgresClient } from "@/lib/postgres-verification";
import {
  cleanupStatement,
  cleanupEligible,
  identifier,
  type ObservedRecord,
} from "@/lib/database-records";

type Proposal = { record: ObservedRecord; marker: string };
type StoredProposal = {
  id: string;
  proposal: Proposal;
  status: string;
  summary: string | null;
};
export type CleanupItem = {
  id: string;
  table: string;
  sql: string;
  bindings: string[];
  status: string;
  summary: string | null;
};
const finalStatuses = ["done", "failed", "cancelled"];

export async function cleanupContext(
  projectId: number,
  runId: number,
  owner: string,
) {
  const rows =
    await getSql()`SELECT r.id,r.status FROM runs r JOIN projects p ON p.id=r.project_id WHERE r.id=${runId} AND r.project_id=${projectId} AND p.owner_github_id=${owner}`;
  if (!Array.isArray(rows) || !rows.length)
    throw new DatabaseCheckError("Run unavailable.");
  return {
    finished: finalStatuses.includes((rows[0] as { status: string }).status),
  };
}

export async function listCleanup(runId: number): Promise<CleanupItem[]> {
  const rows =
    await getSql()`SELECT id,proposal,status,summary FROM run_database_cleanup WHERE run_id=${runId} ORDER BY created_at,id`;
  return (rows as StoredProposal[]).map((row) => ({
    id: row.id,
    table: `public.${row.proposal.record.table}`,
    sql: cleanupStatement(row.proposal.record),
    bindings: [
      row.proposal.marker,
      row.proposal.record.value,
      row.proposal.record.fingerprint,
    ],
    status: row.status,
    summary: row.summary,
  }));
}

export async function decideCleanup(
  runId: number,
  id: string,
  decision: "accept" | "deny",
) {
  const sql = getSql();
  // Atomic claim: double clicks and concurrent requests cannot execute twice.
  const rows =
    await sql`UPDATE run_database_cleanup SET status=${decision === "deny" ? "denied" : "executing"},decided_at=NOW()
    WHERE id=${id} AND run_id=${runId} AND status='pending' RETURNING proposal`;
  if (!Array.isArray(rows) || !rows.length)
    throw new DatabaseCheckError(
      "This cleanup action has already been reviewed. Refresh the report.",
    );
  if (decision === "deny") return;
  const proposal = (rows[0] as { proposal: Proposal }).proposal;
  let committed = false;
  try {
    const config = await runDatabaseConfig(runId, true);
    if (!config)
      throw new DatabaseCheckError(
        "The saved database connection is unavailable.",
      );
    const client = await postgresClient(config.connectionString);
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout = '3s'");
      await client.query("SET LOCAL lock_timeout = '1s'");
      await client.query(
        `LOCK TABLE ONLY public.${identifier(proposal.record.table)} IN SHARE ROW EXCLUSIVE MODE`,
      );
      if (!(await cleanupEligible(client, proposal.record)))
        throw new DatabaseCheckError(
          "The table has dependencies, policies or triggers. Automatic cleanup was blocked; review it manually.",
        );
      // Generated SQL only. Never accept executable SQL or record identifiers
      // from the browser. PK + marker + whole-row fingerprint must all match.
      const result = await client.query({
        text: cleanupStatement(proposal.record),
        values: [
          proposal.marker,
          proposal.record.value,
          proposal.record.fingerprint,
        ],
      });
      if (result.rowCount !== 1)
        throw new DatabaseCheckError(
          "The test record changed or was already removed. Nothing was deleted; review it manually.",
        );
      // A lost COMMIT acknowledgement is uncertain: do not auto-retry this action.
      await client.query("COMMIT");
      committed = true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      await client.end().catch(() => {});
    }
    await sql`UPDATE run_database_cleanup SET status='completed',summary='Removed exactly one unchanged test record.' WHERE id=${id} AND run_id=${runId} AND status='executing'`;
  } catch (error) {
    const message = committed
      ? "The database confirmed cleanup, but the report could not be updated. Do not rerun this action; check the record manually."
      : error instanceof DatabaseCheckError
        ? error.message
        : "Cleanup could not be confirmed. The database may require DELETE permissions, or the connection was interrupted. Check the record manually before trying any other cleanup.";
    await sql`UPDATE run_database_cleanup SET status='error',summary=${message} WHERE id=${id} AND run_id=${runId} AND status='executing'`;
    throw new DatabaseCheckError(message);
  }
}

export type CleanupRun = {
  id: number;
  status: string;
  created_at: string;
  pending_count: number;
  total_count: number;
};
export async function listProjectCleanupRuns(
  projectId: number,
  owner: string,
): Promise<CleanupRun[]> {
  const rows = await getSql()`SELECT r.id,r.status,r.created_at,
    (SELECT count(*)::int FROM run_database_cleanup c WHERE c.run_id=r.id AND c.status='pending') AS pending_count,
    (SELECT count(*)::int FROM run_database_cleanup c WHERE c.run_id=r.id) AS total_count
    FROM runs r JOIN projects p ON p.id=r.project_id
    WHERE r.project_id=${projectId} AND p.owner_github_id=${owner} AND jsonb_typeof(r.database_snapshot)='object'
    ORDER BY r.created_at DESC,r.id DESC`;
  return rows as CleanupRun[];
}
