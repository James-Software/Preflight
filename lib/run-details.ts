import type {
  Run,
  FindingReport,
  TestStepResult,
  DatabaseCheckReport,
} from "@/lib/schema";

export function displayRunStatus(status: string, hasResults = false) {
  return status === "failed" && hasResults ? "partial" : status;
}
export function runStatusLabel(status: string) {
  if (status === "partial") return "Partially completed";
  if (["done", "completed"].includes(status)) return "Completed";
  return status;
}
export function safeRunFailure(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "";
  const status = message.match(/\b(?:HTTP|error)\s+([45]\d\d)\b/i)?.[1];
  const suffix = status ? ` (HTTP ${status})` : "";
  if (
    /Authentication check failed|renew.*session|authentication profile|signed-in page/i.test(
      message,
    )
  )
    return `The saved sign-in could not be verified${suffix}. Check the profile's protected page and session configuration.`;
  if (/action (budget|limit)/i.test(message))
    return "An agent reached its action limit before completing its remaining checks.";
  if (/OpenAI|OpenRouter|Decisions|model|Browser driver/i.test(message))
    return `The AI service or browser driver could not finish this assignment${suffix}. Completed observations were kept.`;
  if (/database|encryption key/i.test(message))
    return "Database verification could not complete. Check the saved connection and permissions; other results were kept.";
  return "An agent stopped before completing its assignment. Completed observations were kept.";
}
export function runDetails(report: {
  run: Run;
  findings: FindingReport[];
  testResults?: TestStepResult[];
  databaseChecks?: DatabaseCheckReport[];
}) {
  const results = report.testResults || [],
    checks = report.databaseChecks || [];
  const hasResults =
    !!report.findings.length ||
    results.some((r) => r.status !== "not_tested") ||
    checks.some((c) => ["passed", "failed"].includes(c.status));
  return {
    runId: report.run.id,
    status: displayRunStatus(report.run.status, hasResults),
    storedStatus: report.run.status,
    reason:
      report.run.failure_reason ||
      (report.run.status === "failed" && hasResults
        ? "This run stopped before all checks finished. Completed findings remain available."
        : null),
    errorRecorded: !!report.run.failure_reason,
    findings: report.findings.map((f) => ({
      id: f.id,
      title: f.title,
      status: f.status,
    })),
    checks: results.map((r) => ({
      title: r.title,
      status: r.status === "needs_review" ? "inconclusive" : r.status,
      summary: r.summary,
      ...(r.investigation ? { investigation: {
        state: r.investigation.state,
        conclusion: r.investigation.conclusion,
        summary: r.investigation.summary,
        sourceSha: r.investigation.source_sha,
        deploymentVerified: r.investigation.deployment_verified,
        citations: r.investigation.citations,
        retestStatus: r.investigation.retest_status,
        failureStage: r.investigation.failure_stage,
        regression: r.investigation.regression,
      } } : {}),
    })),
    database: checks.map((c) => ({
      title: c.title,
      status: c.status,
      summary: c.summary,
    })),
  };
}
