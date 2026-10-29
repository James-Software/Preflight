import { task, tasks } from "@trigger.dev/sdk";
import { ensureSchema } from "@/lib/schema";
import { getSql } from "@/lib/db";
import { renewRunAuthentication } from "@/lib/run-authentication";

/** Upgrade older partial reports in place without replaying the swarm's writes. */
export const recoverRunVerification = task({
  id: "recover-run-verification", maxDuration: 3600, retry: { maxAttempts: 1 },
  run: async ({ runId, projectId }: { runId: number; projectId: number }) => {
    await ensureSchema();
    const sql = getSql();
    const claimed = await sql`UPDATE runs SET status='running',verification_version=2,finished_at=NULL
      WHERE id=${runId} AND project_id=${projectId} AND status='partial' AND archived_at IS NULL
        AND verification_version<2 RETURNING id,auth_profile_id`;
    if (!(claimed as any[]).length) return { recovered: false };
    try {
      if ((claimed as any[])[0].auth_profile_id) {
        // Renew managed test identities through the existing web-only issuer.
        // An unavailable session does not prevent independent source testing.
        await renewRunAuthentication(runId).catch(() => false);
      }
      await sql`UPDATE run_check_investigations i SET state='queued',completed_at=NULL
        FROM run_test_results t WHERE i.run_id=${runId} AND t.run_id=i.run_id
          AND t.agent_index=i.agent_index AND t.step_id=i.step_id
          AND t.status IN ('inconclusive','needs_review','not_tested','blocked')`;
      await tasks.triggerAndWait("investigate-checks", { runId }, { idempotencyKey: `verification-v2:${runId}` });
    } finally {
      const pending = await sql`SELECT
        (SELECT COUNT(*) FROM run_test_results WHERE run_id=${runId} AND status IN ('inconclusive','needs_review','not_tested','blocked')) +
        (SELECT COUNT(*) FROM run_database_checks WHERE run_id=${runId} AND status<>'passed') AS count`;
      const incomplete = Number((pending as any[])[0]?.count) > 0;
      await sql`UPDATE runs SET status=${incomplete ? "partial" : "done"},finished_at=NOW(),
        failure_reason=${incomplete ? "Autonomous verification completed; remaining prerequisites and evidence limitations are listed per check." : null}
        WHERE id=${runId} AND status='running'`;
    }
    return { recovered: true };
  },
});
