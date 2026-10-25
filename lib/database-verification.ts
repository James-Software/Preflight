import { setTimeout as delay } from "node:timers/promises";
import { getSql } from "@/lib/db";
import { runDatabaseConfig } from "@/lib/database-connections";
import { postgresReader } from "@/lib/postgres-verification";
import {
  DatabaseCheckError,
  checkMarker,
  checkObservable,
  checkPassed,
  type DatabaseCheck,
  type Scalar,
} from "@/lib/database-check-config";

export async function databaseCheckResult(
  runId: number,
  checkId: string,
  status: string,
  summary: string | null,
) {
  await getSql()`UPDATE run_database_checks SET status=${status},summary=${summary},completed_at=CASE WHEN ${status} IN ('pending','running') THEN NULL ELSE NOW() END WHERE run_id=${runId} AND check_id=${checkId}`;
}
export async function preflightRunDatabase(runId: number) {
  try {
    const config = await runDatabaseConfig(runId);
    if (!config) return [];
    const reader = await postgresReader(config.connectionString);
    try {
      for (const check of config.checks) {
        const marker = checkMarker(runId, check.id);
        const before = await reader.read(check.query, marker);
        checkObservable(check, before, marker);
      }
    } finally {
      await reader.close();
    }
    return config.checks.map((check) => ({
      id: check.id,
      title: check.title,
      buttonLabel: check.buttonLabel,
      instructions: check.instructions.replaceAll(
        "{{marker}}",
        checkMarker(runId, check.id),
      ),
    }));
  } catch (error) {
    const message =
      error instanceof DatabaseCheckError
        ? error.message
        : "Database verification could not be initialized. Check the connection and encryption key.";
    await getSql()`UPDATE run_database_checks SET status='error',summary=${message},completed_at=NOW() WHERE run_id=${runId} AND status IN ('pending','running')`;
    await getSql()`INSERT INTO run_database_checks(run_id,check_id,title,button_label,status,summary,completed_at)
      VALUES (${runId},'database-preflight','Database connection','Setup','error',${message},NOW())
      ON CONFLICT(run_id,check_id) DO UPDATE SET status='error',summary=EXCLUDED.summary,completed_at=NOW()`;
    throw new DatabaseCheckError(message);
  }
}
export async function runDatabaseVerifier(runId: number, checkId: string) {
  const config = await runDatabaseConfig(runId),
    check = config?.checks.find((c) => c.id === checkId);
  if (!config || !check)
    throw new DatabaseCheckError(
      "The configured database check is unavailable.",
    );
  const reader = await postgresReader(config.connectionString),
    marker = checkMarker(runId, checkId);
  return {
    check,
    async before(): Promise<Scalar> {
      await runDatabaseConfig(runId); // Recheck disconnect/cancellation before the app action.
      const before = await reader.read(check.query, marker);
      checkObservable(check, before, marker);
      await databaseCheckResult(runId, checkId, "running", null);
      return before;
    },
    async after(before: Scalar) {
      const deadline = Date.now() + 5000;
      let passed = false;
      do {
        const after = await reader.read(check.query, marker);
        passed = checkPassed(check, before, after, marker);
        if (passed) break;
        await delay(400);
      } while (Date.now() < deadline);
      const summary = passed
        ? `Confirmed the expected database change after clicking “${check.buttonLabel}”.`
        : `The expected database change was not observed within 5 seconds of clicking “${check.buttonLabel}”.`;
      await databaseCheckResult(
        runId,
        checkId,
        passed ? "passed" : "failed",
        summary,
      );
      return { passed, summary };
    },
    async inconclusive() {
      await databaseCheckResult(
        runId,
        checkId,
        "error",
        `The configured button “${check.buttonLabel}” was not successfully activated. Check the workflow and exact accessible button label.`,
      );
    },
    async close() {
      await reader.close();
    },
  };
}

export async function databaseVerificationError(
  runId: number,
  checkId: string | null,
  message: string,
) {
  await getSql()`UPDATE run_database_checks SET status='error',summary=${message},completed_at=NOW() WHERE run_id=${runId} AND (${checkId}::text IS NULL OR check_id=${checkId}) AND status IN ('pending','running')`;
}
