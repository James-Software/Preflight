"use client";

import { useEffect, useState } from "react";
import type { CleanupItem } from "@/lib/database-cleanup";

const labels: Record<string, string> = {
  pending: "Awaiting approval",
  executing: "Processing · refresh to check",
  completed: "Cleaned up",
  denied: "Kept",
  error: "Needs review",
};
export default function DatabaseCleanup({
  projectId,
  runId,
  active,
  heading = "Cleanup",
}: {
  projectId: number;
  runId: number;
  active: boolean;
  heading?: string;
}) {
  const endpoint = `/api/projects/${projectId}/runs/${runId}/cleanup`;
  const [items, setItems] = useState<CleanupItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(endpoint, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Could not load cleanup proposals.");
        setItems(data.items);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "Could not load cleanup proposals.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [endpoint, active, version]);
  async function decide(id: string, decision: "accept" | "deny") {
    setBusy(id);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not review this action.");
      setItems(data.items);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not review this action.",
      );
      // Disable the local action after an ambiguous network outcome. The server
      // also claims it atomically; an explicit refresh loads its actual status.
      setItems((previous) =>
        previous.map((item) =>
          item.id === id
            ? {
                ...item,
                status: "error",
                summary:
                  "Refresh cleanup to check the saved outcome before proceeding.",
              }
            : item,
        ),
      );
    } finally {
      setBusy(null);
    }
  }
  return (
    <section
      className="mt-10 border-t border-line pt-8"
      aria-labelledby="cleanup-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="cleanup-heading"
          className="text-xl font-semibold tracking-tight"
        >
          {heading}
        </h2>
        <button
          type="button"
          disabled={loading || !!busy}
          onClick={() => setVersion((v) => v + 1)}
          className="min-h-11 rounded-lg px-3 text-sm text-muted hover:bg-panel"
        >
          Refresh cleanup
        </button>
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
        Review the SQL for test records created during this run. Accept removes
        exactly one unchanged record. Deny keeps it. Cleanup never runs
        automatically.
      </p>
      {active && (
        <p role="status" className="mt-3 text-sm text-muted">
          Proposals can be reviewed when the run finishes.
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-500/40 p-3 text-sm"
        >
          {error}
        </p>
      )}
      {loading ? (
        <p role="status" className="mt-4 text-sm text-muted">
          Loading cleanup…
        </p>
      ) : !items.length ? (
        <p className="mt-4 text-sm text-muted">
          No eligible test records to clean up. Tables with dependencies,
          triggers or row policies require manual cleanup. Unverified workflows
          may also need manual review.
        </p>
      ) : (
        <ul className="mt-5 space-y-4">
          {items.map((item, index) => (
            <li
              key={item.id}
              className="min-w-0 rounded-lg border border-line bg-surface p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="break-all text-sm font-semibold">
                  {index + 1}. Remove test record · {item.table}
                </h3>
                <span
                  role="status"
                  className={`text-xs ${item.status === "completed" ? "text-green-700 dark:text-green-300" : "text-muted"}`}
                >
                  {item.status === "completed" ? "✓ " : ""}
                  {labels[item.status] || item.status}
                </span>
              </div>
              <p className="mt-2 break-all text-xs text-muted">
                Record ID: {item.bindings[1]} · Maximum affected rows: 1
              </p>
              <pre className="mt-4 overflow-x-auto rounded-lg bg-panel p-4 text-xs leading-relaxed">
                <code className="language-sql">{item.sql}</code>
              </pre>
              <details className="mt-2 text-xs text-muted">
                <summary className="flex min-h-11 items-center">
                  Query parameters
                </summary>
                <pre className="overflow-x-auto rounded-lg bg-panel p-3">
                  <code>
                    {item.bindings
                      .map((value, i) => `$${i + 1} = ${JSON.stringify(value)}`)
                      .join("\n")}
                  </code>
                </pre>
              </details>
              {item.summary && (
                <p className="mt-3 text-sm text-muted">{item.summary}</p>
              )}
              {item.agent_review && <div className="mt-3 border-l-2 border-line pl-3 text-sm text-muted">
                <p className="font-medium">Agent assessment · {item.agent_review.outcome === "safe_to_cleanup" ? "Eligible when inspected" : item.agent_review.outcome === "unsafe_to_cleanup" ? "Not supported for cleanup" : "Needs more evidence"}</p>
                <p className="mt-1 leading-relaxed">{item.agent_review.summary}</p>
                <p className="mt-1 text-xs">This assessment does not approve deletion. Accept rechecks the record.</p>
              </div>}
              {item.status === "pending" && (
                <div className="mt-4 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    disabled={active || !!busy}
                    onClick={() => void decide(item.id, "deny")}
                    className="min-h-11 rounded-full border border-line px-5 text-sm font-medium disabled:opacity-50"
                  >
                    Deny
                  </button>
                  <button
                    type="button"
                    disabled={active || !!busy}
                    onClick={() => void decide(item.id, "accept")}
                    className="btn-primary min-h-11 px-5 text-sm font-medium disabled:opacity-50"
                  >
                    {busy === item.id ? "Processing…" : "Accept cleanup"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
