import type { TestStepResult } from "@/lib/schema";

export default function TestStepResults({
  results,
}: {
  results: TestStepResult[];
}) {
  if (!results.length) return null;
  const unresolved = results.filter((r) =>
    ["blocked", "needs_review"].includes(r.status),
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
        blocked · {results.filter((r) => r.status === "needs_review").length}{" "}
        need review
      </p>
      {unresolved.length > 0 && (
        <ul className="mt-4 divide-y divide-line rounded-lg border border-line bg-panel px-4">
          {unresolved.map((r, i) => (
            <li key={`${r.step_id}-${i}`} className="py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium">{r.title}</h3>
                <span className="text-xs text-muted">
                  {r.status === "blocked" ? "Blocked" : "Needs review"}
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
      )}
    </section>
  );
}
