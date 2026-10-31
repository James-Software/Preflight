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
  const reproduced = results.filter(r => r.status === "confirmed").length;
  const investigated = results.filter((r) => r.investigation);
  return (
    <section className="mt-10" aria-labelledby="test-coverage">
      <h2 id="test-coverage" className="text-xl font-semibold">
        Test coverage
      </h2>
      <p className="mt-2 text-sm text-muted">
        {results.filter((r) => r.status === "passed").length} passed ·{" "}
        {reproduced} reproduced {reproduced === 1 ? "failure" : "failures"} · {results.filter((r) => r.status === "blocked").length}{" "}
        blocked ·{" "}
        {results.filter(r => ["code_confirmed", "code_passed"].includes(r.status)).length} verified in source ·{" "}
        {
          results.filter((r) =>
            ["needs_review", "inconclusive", "not_tested"].includes(r.status),
          ).length
        }{" "}
        awaiting verification
      </p>
      {investigated.length > 0 && (
        <details className="mt-4 rounded-lg border border-line bg-panel px-4">
          <summary className="min-h-11 cursor-pointer py-3 text-sm text-muted">
            Automatic investigation · {investigated.length} {investigated.length === 1 ? "check" : "checks"}
          </summary>
          <p className="pb-3 text-xs leading-relaxed text-muted">
            Verification combines source review, browser checks and isolated regression tests. Source tests and deployed browser results are reported separately.
          </p>
          <ul className="divide-y divide-line">
            {investigated.map((r, index) => {
              const review = r.investigation!;
              const working = ["investigating", "retesting"].includes(review.state);
              return (
                <li key={`${r.step_id}-${index}`} className="py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-medium">{r.title}</h3>
                    <span className="text-xs text-muted">
                      {working ? review.state === "retesting" ? "Checking in browser…" : "Reading source…"
                        : review.retest_status === "passed" ? "Passed on follow-up"
                          : review.retest_status === "confirmed" ? "Independently reproduced"
                            : review.retest_status === "code_confirmed" ? "Bug reproduced in source test"
                              : review.retest_status === "code_passed" ? "Source regression passed"
                                : "Verification incomplete"}
                    </span>
                  </div>
                  {review.conclusion && <p className="mt-2 text-xs font-medium text-muted">{({ bug_hypothesis: "Possible cause in source", expected_behavior: "Expected behavior in source", blocked: "Missing prerequisite in source", unresolved: "Source review inconclusive" } as Record<string, string>)[review.conclusion] || "Source review inconclusive"}</p>}
                  {review.summary && <p className="mt-2 text-sm leading-relaxed text-muted">{review.summary}</p>}
                  {!working && ["not_retried", "unavailable"].includes(review.retest_status || "") && (
                    <p className="mt-2 text-xs text-muted">{review.retest_status === "not_retried"
                      ? "A browser follow-up could not safely repeat this workflow."
                      : "The browser follow-up was unavailable. Original observations were kept."}</p>
                  )}
                  {review.regression && (
                    <details className="mt-3 text-xs text-muted">
                      <summary className="min-h-11 cursor-pointer py-3">Executed source regression</summary>
                      <p>{review.regression.summary}</p>
                      <p className="mt-2">Scope: repository code; deployed browser behavior is separate.</p>
                      <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words">{review.regression.output}</pre>
                      <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words">{review.regression.test}</pre>
                    </details>
                  )}
                  {review.source_sha && (
                    <p className="mt-2 text-xs text-muted">
                      Source <code>{review.source_sha.slice(0, 7)}</code> · {review.deployment_verified
                        ? "Matched to the tested deployment"
                        : "Selected commit; deployed version could not be verified"}
                    </p>
                  )}
                  {!!review.citations?.length && (
                    <ul className="mt-2 space-y-1 text-xs text-muted">
                      {review.citations.map((c, i) => <li key={i} className="break-all"><code>{c.path}:{c.start}{c.end !== c.start ? `–${c.end}` : ""}</code></li>)}
                    </ul>
                  )}
                  {review.state === "unavailable" && <p className="mt-2 text-xs text-muted">The investigation stopped before completion. No additional bug was confirmed.</p>}
                </li>
              );
            })}
          </ul>
        </details>
      )}
      {unresolved.length > 0 && (
        <details className="mt-4 rounded-lg border border-line bg-panel px-4">
          <summary className="min-h-11 cursor-pointer py-3 text-sm text-muted">
            {unresolved.length} {unresolved.length === 1 ? "check needs" : "checks need"} follow-up
          </summary>
          <p className="pb-3 text-xs text-muted">
            Each check keeps its investigation result and remaining blocker.
            Only independently reproduced failures count as bugs.
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
: "Verification incomplete"}
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
