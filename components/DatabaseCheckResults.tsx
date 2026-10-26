import type { DatabaseCheckReport } from "@/lib/schema";
export default function DatabaseCheckResults({
  checks,
}: {
  checks: DatabaseCheckReport[];
}) {
  if (!checks.length) return null;
  const isSetup = (check: DatabaseCheckReport) =>
    ["error", "blocked"].includes(check.status) &&
    (check.button_label === "Automatic" || check.button_label === "Setup");
  const setup = [
    ...new Map(
      checks
        .filter(isSetup)
        .map((check) => [check.summary || check.title, check]),
    ).values(),
  ];
  const assertions = checks.filter((check) => !isSetup(check));
  const groups = new Map<
    string,
    { check: DatabaseCheckReport; count: number }
  >();
  for (const check of assertions) {
    // Automatic observations have separate markers/IDs even when they exercise
    // the same action. Collapse identical display results, retaining their count.
    // Configured checks and different outcomes remain separate.
    const key = /^auto-\d+-\d+-\d+-[a-f0-9]+$/i.test(check.check_id)
      ? JSON.stringify([
          check.title,
          check.button_label,
          check.status,
          check.summary,
        ])
      : check.check_id;
    const existing = groups.get(key);
    if (existing) existing.count++;
    else groups.set(key, { check, count: 1 });
  }
  const labels: Record<string, string> = {
    passed: "Confirmed",
    failed: "Not confirmed",
    error: "Unverified",
    running: "Checking",
    pending: "Pending",
  };
  return (
    <section className="mt-10" aria-labelledby="database-results">
      <h2
        id="database-results"
        className="text-xl font-semibold tracking-tight"
      >
        Database verification
      </h2>
      <p className="mt-2 text-sm text-muted">
        {assertions.length
          ? `${assertions.filter((check) => check.status === "passed").length} of ${assertions.length} database checks confirmed the expected change.`
          : "No database assertions completed. Persistence has not been verified."}
      </p>
      {setup.length > 0 && (
        <div className="mt-4 rounded-lg border border-line bg-panel p-4">
          <h3 className="text-sm font-semibold">
            {setup.some((c) => c.status === "error")
              ? "Database verification needs attention"
              : "Database workflow blocked"}
          </h3>
          <ul className="mt-2 space-y-2 text-sm text-muted">
            {setup.map((check) => (
              <li key={check.check_id}>{check.summary || check.title}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            {setup.some((c) => c.status === "error")
              ? "Review the connection or permissions described above, then start a new run. These checks do not establish an application bug."
              : "The agent could not complete a supported create action. A database connection alone does not grant access to every app workflow. Use a profile with the required access and run again."}
          </p>
        </div>
      )}
      {assertions.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-lg border border-line">
          <table className="w-full table-fixed text-left text-sm">
            <caption className="sr-only">
              Database checks and persistence results
            </caption>
            <thead className="bg-panel text-xs text-muted">
              <tr>
                <th className="px-4 py-4 font-medium" scope="col">
                  Check
                </th>
                <th className="w-32 px-4 py-4 font-medium" scope="col">
                  Result
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...groups.values()].map(({ check, count }) => (
                <tr key={check.check_id}>
                  <td className="min-w-0 px-4 py-5">
                    <p className="break-words font-medium">{check.title}</p>
                    <p className="mt-1 break-words text-xs text-muted">
                      Button: {check.button_label}
                    </p>
                    {count > 1 && (
                      <p className="mt-1 text-xs text-muted">
                        {count} observations
                      </p>
                    )}
                    {check.summary && (
                      <p className="mt-3 break-words text-xs leading-relaxed text-muted">
                        {check.summary}
                      </p>
                    )}
                  </td>
                  <td
                    className={`px-4 py-5 align-top ${check.status === "passed" ? "text-green-700 dark:text-green-300" : check.status === "failed" ? "text-red-700 dark:text-red-300" : "text-muted"}`}
                  >
                    <span>
                      {check.status === "passed" ? "✓ " : ""}
                      {labels[check.status] || check.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
