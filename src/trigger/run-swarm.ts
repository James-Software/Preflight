import { task, tasks } from "@trigger.dev/sdk";
import { getSql } from "@/lib/db";
import { updateRunStatus } from "@/lib/schema";
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
 * run done with a findings count. Diagnosis + fix PRs are Phase 4.
 */
export const runSwarm = task({
  id: "run-swarm",
  maxDuration: 1800,
  run: async (payload: { runId: number }) => {
    const sql = getSql();
    const rows = await sql`
      SELECT r.id, r.plan, p.app_url
      FROM runs r
      JOIN projects p ON p.id = r.project_id
      WHERE r.id = ${payload.runId}
    `;
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error(`Run ${payload.runId} not found`);
    }
    const run = rows[0] as { id: number; plan: unknown; app_url: string };

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
      await tasks.batchTriggerAndWait(
        "browser-agent",
        assignments.map((assignment, i) => ({
          payload: {
            runId: payload.runId,
            agentIndex: i,
            assignment,
            appUrl: run.app_url,
          },
        }))
      );
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
