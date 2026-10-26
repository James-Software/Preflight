import type { TestStepResult } from "@/lib/schema";

export default function TestStepResults({
  results,
}: {
  results: TestStepResult[];
}) {
  if (!results.length) return null;
  const unresolved = results.filter((r) =>
    ["blocked", "needs_review", "inconclusive", "not_tested"].includes(
      r.status,
    ),
  );
  return (
    <section className="mt-10" aria-labelledby="test-coverage">
      <h2 id="test-coverage" className="text-xl font-semibold">
        Test coverage
      </h2>
      <p className="mt-2 text-sm text-muted">
        {results.filter((r) => r.status === "passed").length} passed ·{" "}
        {results.filter((r) => r.status === "confirmed").length} reproduced
        failures · {results.filter((r) => r.status === "blocked").length}{" "}
        blocked ·{" "}
        {
          results.filter((r) =>
            ["needs_review", "inconclusive", "not_tested"].includes(r.status),
          ).length
        }{" "}
        not confirmed
      </p>
      {unresolved.length > 0 && (
        <details className="mt-4 rounded-lg border border-line bg-panel px-4">
          <summary className="min-h-11 cursor-pointer py-3 text-sm text-muted">
            {unresolved.length} checks could not be completed or confirmed
          </summary>
          <p className="pb-3 text-xs text-muted">
            These observations are not counted as bugs. Findings below are
            available for prompts and PRs.
          </p>
          <ul className="divide-y divide-line">
            {unresolved.map((r, i) => (
              <li key={`${r.step_id}-${i}`} className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">{r.title}</h3>
                  <span className="text-xs text-muted">
                    {r.status === "blocked"
                      ? "Blocked"
                      : r.status === "not_tested"
                        ? "Not completed"
                        : "Not confirmed"}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {r.summary}
                </p>
                {r.evidence && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-muted">
                      View observations
                    </summary>
                    <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md bg-page p-3 text-xs">
                      {r.evidence}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
