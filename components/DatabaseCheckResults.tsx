import type { DatabaseCheckReport } from "@/lib/schema";
export default function DatabaseCheckResults({
  checks,
}: {
  checks: DatabaseCheckReport[];
}) {
  if (!checks.length) return null;
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
        {checks.filter((check) => check.status === "passed").length} of{" "}
        {checks.length} checks confirmed a saved change after the button click.
      </p>
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
            {checks.map((check) => (
              <tr key={check.check_id}>
                <td className="min-w-0 px-4 py-5">
                  <p className="break-words font-medium">{check.title}</p>
                  <p className="mt-1 break-words text-xs text-muted">
                    Button: {check.button_label}
                  </p>
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
    </section>
  );
}
