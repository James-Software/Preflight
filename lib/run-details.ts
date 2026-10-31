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
  if (error && typeof error === "object" && "name" in error && error.name === "TargetAccessError" && "message" in error)
    return String(error.message).slice(0, 300);
  // Trigger serializes thrown strings/custom objects and nested causes. Match
  // known categories without exposing provider bodies, CDP URLs or credentials.
  const messages: string[] = [];
  const visit = (value: unknown, depth = 0) => {
    if (depth > 3 || !value) return;
    if (typeof value === "string") { messages.push(value.slice(0, 1000)); return; }
    if (typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    for (const key of ["message", "raw", "code"]) if (typeof record[key] === "string") messages.push(String(record[key]).slice(0, 1000));
    visit(record.cause, depth + 1);
    if (Array.isArray(record.causes)) record.causes.slice(0, 3).forEach(cause => visit(cause, depth + 1));
  };
  visit(error);
  const message = messages.join(" ");
  const status = message.match(/\b(?:HTTP|error)\s+([45]\d\d)\b/i)?.[1];
  const suffix = status ? ` (HTTP ${status})` : "";
  if (/Browserbase|cloud browser|connectOverCDP/i.test(message))
    return /429|capacity|concurren/i.test(message)
      ? "Cloud browser capacity was unavailable. Completed observations were kept; retry this run after existing browser sessions finish."
      : `The cloud browser connection could not complete${suffix}. Completed observations were kept.`;
  if (/OOM|OUT_OF_MEMORY|MEMORY_EXCEEDED|PROCESS_OOM_KILLED/i.test(message))
    return "The worker exceeded its memory allocation. Completed observations were kept.";
  if (/MAX_DURATION|TIMEOUT|timed? ?out|TimeoutError/i.test(message))
    return "The browser or worker exceeded its time limit. Completed observations were kept.";
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
