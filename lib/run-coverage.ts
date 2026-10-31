import { getSql } from "@/lib/db";

/** A completed negative assertion is evidence; infrastructure errors are incomplete. */
export async function runCoverage(runId: number) {
  const rows = await getSql()`SELECT
    (SELECT COUNT(*) FROM run_test_results WHERE run_id=${runId} AND status<>'not_tested') +
    (SELECT COUNT(*) FROM run_database_checks WHERE run_id=${runId} AND status IN ('passed','failed')) AS observed,
    (SELECT COUNT(*) FROM run_test_results WHERE run_id=${runId} AND status IN ('not_tested','inconclusive','needs_review','blocked')) +
    (SELECT COUNT(*) FROM run_database_checks WHERE run_id=${runId} AND status NOT IN ('passed','failed')) AS incomplete`;
  return { observed: Number((rows as any[])[0]?.observed) || 0, incomplete: Number((rows as any[])[0]?.incomplete) || 0 };
}
