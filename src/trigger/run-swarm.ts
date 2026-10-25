import { getRunAuthentication } from "@/lib/auth-profiles";
import { task, tasks } from "@trigger.dev/sdk";
import { getSql } from "@/lib/db";
import { updateRunStatus } from "@/lib/schema";
import { assertSwarmModelConfig } from "@/lib/model-config";
import type { Assignment, PlanStep } from "./browser-agent";

function chunk<T>(arr: T[], n: number): T[][] {
  if (arr.length === 0) return [];
  const size = Math.max(1, Math.ceil(arr.length / n));
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * run-swarm — the swarm parent. Ensures a test plan exists (generating one
 * first if needed), splits it across agents, fans them out, and marks the
 * run done with a findings count. Fix PRs are opened separately from stored patches in the run report.
 */
export const runSwarm = task({
  id: "run-swarm",
  maxDuration: 1800,
  run: async (payload: { runId: number; targetUrl?: string }) => {
    const sql = getSql();
    const rows = await sql`
      SELECT r.id, r.status, r.plan, r.target_url, r.auth_profile_id, r.auth_profile_snapshot, p.app_url
      FROM runs r
      JOIN projects p ON p.id = r.project_id
      WHERE r.id = ${payload.runId}
    `;
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error(`Run ${payload.runId} not found`);
    }
    const run = rows[0] as {
      id: number;
      status: string;
      plan: unknown;
      target_url: string | null;
      app_url: string | null;
      auth_profile_id?: number | null;
      auth_profile_snapshot?: unknown;
    };
    // The run may have been cancelled (or failed) between trigger and
    // pickup. Never spend Browserbase/LLM money on a dead run.
    if (
      run.status === "cancelled" ||
      run.status === "failed" ||
      run.status === "done"
    ) {
      return {
        runId: payload.runId,
        status: "skipped",
        reason: `run already ${run.status}`,
      };
    }
    // Resolved at run creation: explicit target, else the project's App URL.
    const targetUrl =
      payload.targetUrl ?? run.target_url ?? run.app_url ?? null;
    if (!targetUrl) {
      await updateRunStatus(payload.runId, "failed");
      throw new Error(
        "Run has no target URL: set an App URL on the project or connect a hosting provider for preview deployments.",
      );
    }

    try {
      assertSwarmModelConfig();
      if (run.auth_profile_id || run.auth_profile_snapshot)
        await getRunAuthentication(payload.runId);
    } catch (error) {
      await updateRunStatus(payload.runId, "failed");
      throw error;
    }

    let plan = run.plan as PlanStep[] | null;
    if (!Array.isArray(plan) || plan.length === 0) {
      await updateRunStatus(payload.runId, "planning");
      await tasks.triggerAndWait("generate-test-plan", {
        runId: payload.runId,
      });
      const r2 = await sql`SELECT plan FROM runs WHERE id = ${payload.runId}`;
      plan =
        Array.isArray(r2) && r2.length > 0
          ? ((r2[0] as { plan: unknown }).plan as PlanStep[])
          : null;
    }
    if (!Array.isArray(plan) || plan.length === 0) {
      await updateRunStatus(payload.runId, "failed");
      throw new Error("No test plan available for this run");
    }

    await updateRunStatus(payload.runId, "running");
    const chunks = chunk(plan, 3);
    const assignments: Assignment[] = chunks.map((steps, i) => ({
      goal: `Swarm agent ${i + 1} of ${chunks.length}: ${steps
        .map((s) => s.title)
        .join("; ")}`,
      steps,
    }));

    try {
      const result = await tasks.batchTriggerAndWait(
        "browser-agent",
        assignments.map((assignment, i) => ({
          payload: {
            runId: payload.runId,
            agentIndex: i,
            assignment,
            appUrl: targetUrl,
            ...(run.auth_profile_id
              ? { authProfileId: run.auth_profile_id }
              : {}),
          },
        })),
      );
      if (result.runs.some((agent) => !agent.ok)) {
        throw new Error(
          "A browser agent failed. Check its Trigger.dev task log for model or browser errors.",
        );
      }
    } catch (e) {
      await updateRunStatus(payload.runId, "failed");
      throw e;
    }

    const frows = await sql`
      SELECT COUNT(*)::int AS c FROM findings WHERE run_id = ${payload.runId}
    `;
    const findings =
      Array.isArray(frows) && frows.length > 0
        ? ((frows[0] as { c: number }).c ?? 0)
        : 0;
    await updateRunStatus(payload.runId, "done");
    return { runId: payload.runId, findings };
  },
});
