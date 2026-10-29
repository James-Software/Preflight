import { tasks } from "@trigger.dev/sdk";
import { getTriggerClientConfig } from "@/lib/trigger-client";
import type { Run, TestStepResult } from "@/lib/schema";

/** Called only after the report's project membership has been authorized. */
export async function recoverLegacyVerification(run: Run, results: TestStepResult[]) {
  if (run.status !== "partial" || run.archived_at || (run.verification_version || 0) >= 2 ||
    !results.some(r => ["inconclusive", "needs_review", "not_tested", "blocked"].includes(r.status))) return false;
  try {
    await tasks.trigger("recover-run-verification", { runId: run.id, projectId: run.project_id },
      { idempotencyKey: `recover-verification-v2:${run.id}` }, { clientConfig: getTriggerClientConfig() });
    return true;
  } catch { return false; }
}
