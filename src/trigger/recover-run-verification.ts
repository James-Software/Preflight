import { dispatchRequestedRunRetry } from "@/lib/requested-run-retry";
import { runCoverage } from "@/lib/run-coverage";
import { schedules, task, tasks } from "@trigger.dev/sdk";
import { ensureSchema } from "@/lib/schema";
import { getSql } from "@/lib/db";
import { renewRunAuthentication } from "@/lib/run-authentication";

/** Upgrade older partial reports in place without replaying the swarm's writes. */
export const recoverRunVerification = task({
  id: "recover-run-verification", queue: { name: "verification-recovery", concurrencyLimit: 1 }, maxDuration: 3600, retry: { maxAttempts: 1 },
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
      const incomplete = (await runCoverage(runId)).incomplete > 0;
      await sql`UPDATE runs SET status=${incomplete ? "partial" : "done"},finished_at=NOW(),
        failure_reason=${incomplete ? "Autonomous verification completed; remaining prerequisites and evidence limitations are listed per check." : null}
        WHERE id=${runId} AND status='running'`;
    }
    return { recovered: true };
  },
});

/** Recover legacy reports without depending on a person opening the page. */
export const recoverPendingVerifications = schedules.task({
  id: "recover-pending-verifications",
  cron: { pattern: "*/5 * * * *", environments: ["PRODUCTION"] },
  maxDuration: 60,
  run: async () => {
    await ensureSchema();
    await dispatchRequestedRunRetry((runId, key) => tasks.trigger("run-swarm", { runId }, { idempotencyKey: key }));
    const rows = await getSql()`SELECT r.id,r.project_id FROM runs r
      WHERE r.status='partial' AND r.archived_at IS NULL AND r.verification_version<2
        AND EXISTS(SELECT 1 FROM run_test_results t WHERE t.run_id=r.id AND t.agent_index>=0
          AND t.status IN ('inconclusive','needs_review','not_tested','blocked')
          AND t.step_id NOT LIKE 'database-%' AND t.step_id NOT LIKE 'automatic-database%')
      ORDER BY r.id LIMIT 5`;
    let queued = 0;
    for (const row of rows as any[]) {
      await tasks.trigger("recover-run-verification", { runId: row.id, projectId: row.project_id },
        { idempotencyKey: `recover-verification-v2:${row.id}` });
      queued++;
    }
    return { queued };
  },
});
