import {
  preflightAutomaticDatabase,
  automaticDatabaseBlocked,
} from "@/lib/automatic-database";
import {
  preflightRunDatabase,
  databaseVerificationError,
} from "@/lib/database-verification";
import { getRunAuthentication } from "@/lib/auth-profiles";
import { renewRunAuthentication } from "@/lib/run-authentication";
import { task, tasks } from "@trigger.dev/sdk";
import { getSql } from "@/lib/db";
import { updateRunStatus, recordTestResult } from "@/lib/schema";
import { safeRunFailure } from "@/lib/run-details";
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
  maxDuration: 3600,
  retry: { maxAttempts: 1 },
  run: async (payload: { runId: number; targetUrl?: string }) => {
    const sql = getSql();
    const rows = await sql`
      SELECT r.id, r.status, r.plan, r.target_url, r.auth_profile_id, r.auth_profile_snapshot, r.database_snapshot, p.app_url
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
      database_snapshot?: unknown;
    };
    // The run may have been cancelled (or failed) between trigger and
    // pickup. Never spend Browserbase/LLM money on a dead run.
    if (
      run.status === "cancelled" ||
      run.status === "failed" ||
      run.status === "done" ||
      run.status === "completed" ||
      run.status === "partial"
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
      await updateRunStatus(
        payload.runId,
        "failed",
        "No app URL is configured for this run.",
      );
      throw new Error(
        "Run has no target URL: set an App URL on the project or connect a hosting provider for preview deployments.",
      );
    }

    let databaseChecks: Awaited<ReturnType<typeof preflightRunDatabase>> = [];
    try {
      assertSwarmModelConfig();
      if (run.auth_profile_id || run.auth_profile_snapshot) {
        await renewRunAuthentication(payload.runId);
        await getRunAuthentication(payload.runId);
      }
      if (run.database_snapshot)
        databaseChecks = await preflightRunDatabase(payload.runId);
    } catch (error) {
      await updateRunStatus(payload.runId, "failed", safeRunFailure(error));
      throw error;
    }

    const automaticReady = run.database_snapshot
      ? await preflightAutomaticDatabase(payload.runId)
      : false;
    const cancelled = async () => {
      const current =
        await sql`SELECT status FROM runs WHERE id = ${payload.runId}`;
      if (
        Array.isArray(current) &&
        (current[0] as { status?: string } | undefined)?.status === "cancelled"
      ) {
        if (run.database_snapshot)
          await databaseVerificationError(
            payload.runId,
            null,
            "The run was cancelled before this database check completed.",
          );
        return true;
      }
      return false;
    };
    let plan = run.plan as PlanStep[] | null;
    if (!Array.isArray(plan) || plan.length === 0) {
      await updateRunStatus(payload.runId, "planning");
      try {
        const planning = await tasks.triggerAndWait("generate-test-plan", {
          runId: payload.runId,
        });
        if (planning?.ok === false) throw planning.error;
        const r2 = await sql`SELECT plan FROM runs WHERE id = ${payload.runId}`;
        plan =
          Array.isArray(r2) && r2.length > 0
            ? ((r2[0] as { plan: unknown }).plan as PlanStep[])
            : null;
      } catch (error) {
        await updateRunStatus(payload.runId, "failed", safeRunFailure(error));
        throw error;
      }
    }
    if (!Array.isArray(plan) || plan.length === 0) {
      await updateRunStatus(
        payload.runId,
        "failed",
        "No test plan was available for this run.",
      );
      throw new Error("No test plan available for this run");
    }

    if (await cancelled()) return { runId: payload.runId, status: "cancelled" };
    await updateRunStatus(payload.runId, "running");
    const chunks = chunk(plan, 3);
    const assignments: Assignment[] = chunks.map((steps, i) => ({
      goal: `Swarm agent ${i + 1} of ${chunks.length}: ${steps
        .map((s) => s.title)
        .join("; ")}`,
      steps,
    }));

    const problems: string[] = [];
    let completedAgents = 0;
    const interrupted = async (
      index: number,
      steps: PlanStep[],
      error: unknown,
    ) => {
      const reason = safeRunFailure(error);
      problems.push(reason);
      for (const [stepIndex, step] of steps.entries())
        await recordTestResult(
          payload.runId,
          index,
          {
            step_id: step.id || `step-${stepIndex}`,
            title: step.title,
            status: "not_tested",
            summary: reason,
          },
          false,
        );
    };
    try {
      const result = await tasks.batchTriggerAndWait(
        "browser-agent",
        assignments.map((assignment, i) => ({
          payload: {
            runId: payload.runId,
            agentIndex: i,
            assignment,
            appUrl: targetUrl,
            verifyDatabase: automaticReady,
            ...(run.auth_profile_id
              ? { authProfileId: run.auth_profile_id }
              : {}),
          },
        })),
      );
      for (const [index, resultRun] of result.runs.entries()) {
        if (resultRun.ok) completedAgents++;
        else
          await interrupted(
            index,
            assignments[index]?.steps || [
              { id: `agent-${index}`, title: "Browser checks", detail: "" },
            ],
            resultRun.error,
          );
      }
      for (let index = result.runs.length; index < assignments.length; index++)
        await interrupted(
          index,
          assignments[index].steps,
          new Error("Browser agent did not return a result."),
        );
      if (await cancelled())
        return { runId: payload.runId, status: "cancelled" };
      const confirmedAutomatic = automaticReady
        ? await sql`SELECT check_id FROM run_database_checks WHERE run_id=${payload.runId} AND check_id LIKE 'auto-%' AND status='passed' LIMIT 1`
        : [];
      // Regular agents may already have verified a marked create action. Only
      // allocate the fallback workflow when no automatic assertion succeeded.
      if (
        automaticReady &&
        completedAgents > 0 &&
        (!Array.isArray(confirmedAutomatic) || !confirmedAutomatic.length)
      ) {
        const automatic = await tasks.triggerAndWait("browser-agent", {
          runId: payload.runId,
          agentIndex: assignments.length,
          appUrl: targetUrl,
          verifyDatabase: true,
          assignment: {
            goal: "Create a test record and verify it was saved",
            steps: [
              {
                id: "automatic-database-create",
                title: "Create a test record",
                detail:
                  "Find a safe create workflow available in the app, such as creating a project, draft or waitlist entry. Use the provided unique test marker for its name or title, or the provided test email for an email-only form. Submit through the app and inspect the result. Empty database tables are supported. If no such workflow is accessible, stop and explain why. Do not create login accounts, send messages, make payments, delete existing records or change security settings.",
              },
            ],
          },
          ...(run.auth_profile_id
            ? { authProfileId: run.auth_profile_id }
            : {}),
        });
        if (!automatic.ok) {
          await interrupted(
            assignments.length,
            [
              {
                id: "automatic-database-create",
                title: "Create a test record",
                detail: "",
              },
            ],
            automatic.error,
          );
          await automaticDatabaseBlocked(
            payload.runId,
            assignments.length,
            0,
            "The database workflow agent stopped before completing verification. Other results were kept.",
          );
        } else completedAgents++;
      }
      if (!completedAgents && run.database_snapshot)
        await databaseVerificationError(
          payload.runId,
          null,
          "Browser checks could not complete, so database verification was not evaluated.",
        );
      for (const [index, check] of databaseChecks.entries()) {
        if (!completedAgents) {
          await interrupted(
            assignments.length + 1 + index,
            [{ id: `database-${check.id}`, title: check.title, detail: "" }],
            new Error("Browser checks could not start."),
          );
          continue;
        }
        if (await cancelled())
          return { runId: payload.runId, status: "cancelled" };
        const verified = await tasks.triggerAndWait("browser-agent", {
          runId: payload.runId,
          agentIndex: assignments.length + 1 + index,
          assignment: {
            goal: check.title,
            steps: [
              {
                id: `database-${check.id}`,
                title: check.title,
                detail: `${check.instructions} Finish by clicking the button with the exact accessible name "${check.buttonLabel}". Database verification will confirm the saved result.`,
                databaseCheckId: check.id,
              },
            ],
          },
          appUrl: targetUrl,
          ...(run.auth_profile_id
            ? { authProfileId: run.auth_profile_id }
            : {}),
        });
        if (!verified.ok) {
          await interrupted(
            assignments.length + 1 + index,
            [{ id: `database-${check.id}`, title: check.title, detail: "" }],
            verified.error,
          );
          await databaseVerificationError(
            payload.runId,
            check.id,
            "This database workflow stopped before completing verification. Other results were kept.",
          );
        } else completedAgents++;
      }
    } catch (e) {
      if (run.database_snapshot)
        await databaseVerificationError(
          payload.runId,
          null,
          "The run stopped before this database check completed. It has not been verified.",
        );
      problems.push(safeRunFailure(e));
      await recordTestResult(
        payload.runId,
        -1,
        {
          step_id: "run-interrupted",
          title: "Remaining checks",
          status: "not_tested",
          summary: problems.at(-1)!,
        },
        false,
      );
    }

    if (await cancelled()) return { runId: payload.runId, status: "cancelled" };
    // Investigate only unresolved goals, preserving successful checks and writes.
    const unresolved = await sql`SELECT id FROM run_test_results WHERE run_id=${payload.runId}
      AND status IN ('inconclusive','needs_review','not_tested','blocked') AND agent_index>=0 LIMIT 1`;
    if (Array.isArray(unresolved) && unresolved.length) {
      try {
        await tasks.triggerAndWait("investigate-checks", { runId: payload.runId }, {
          idempotencyKey: `investigate-checks:${payload.runId}`,
        });
      } catch { /* The original evidence remains usable if follow-up infrastructure is unavailable. */ }
    }
    if (await cancelled()) return { runId: payload.runId, status: "cancelled" };
    const [frows, coverage, database] = await Promise.all([
      sql`SELECT COUNT(*)::int AS c FROM findings WHERE run_id=${payload.runId} AND deleted_at IS NULL`,
      sql`SELECT COUNT(*) FILTER(WHERE status<>'not_tested')::int AS observed,
        COUNT(*) FILTER(WHERE status IN ('not_tested','inconclusive','needs_review','blocked'))::int AS incomplete
        FROM run_test_results WHERE run_id=${payload.runId}`,
      sql`SELECT COUNT(*) FILTER(WHERE status IN ('passed','failed'))::int AS observed,
        COUNT(*) FILTER(WHERE status<>'passed')::int AS incomplete FROM run_database_checks WHERE run_id=${payload.runId}`,
    ]);
    const findings = Number((frows as any[])[0]?.c) || 0;
    const observed =
      (Number((coverage as any[])[0]?.observed) || 0) +
      (Number((database as any[])[0]?.observed) || 0);
    const incomplete =
      (Number((coverage as any[])[0]?.incomplete) || 0) +
      (Number((database as any[])[0]?.incomplete) || 0);
    const status =
      problems.length && !completedAgents && !findings && !observed
        ? "failed"
        : incomplete || (problems.length && !observed)
          ? "partial"
          : "done";
    const reason =
      status === "failed"
        ? `No browser checks completed. ${problems[0]}`
        : status === "partial"
          ? problems[0] ||
            "Some checks could not be completed or confirmed. Completed findings remain available."
          : null;
    await updateRunStatus(payload.runId, status, reason);
    if (status === "failed") throw new Error(reason!);
    return { runId: payload.runId, findings, status };
  },
});
