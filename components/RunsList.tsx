"use client";

import { useEffect, useRef, useState } from "react";
import RunArchiveButton from "@/components/RunArchiveButton";
import { runStatusLabel } from "@/lib/run-details";

export type RunRow = {
  id: number;
  status: string;
  created_at: string;
  target_url: string | null;
  findingsCount: number;
  archived_at: string | null;
};
const ACTIVE = new Set(["queued", "planning", "planned", "running"]);

export default function RunsList({
  projectId,
  initialRuns,
}: {
  projectId: number;
  initialRuns: RunRow[];
}) {
  const [runs, setRuns] = useState(initialRuns);
  const [view, setView] = useState<"current" | "archived">("current");
  const [notice, setNotice] = useState("");
  const revision = useRef(0);
  const visibleRuns = runs.filter((run) =>
    view === "archived" ? !!run.archived_at : !run.archived_at,
  );
  const updateArchive = (runId: number, archived: boolean) => {
    revision.current++;
    setRuns((previous) =>
      previous.map((run) =>
        run.id === runId
          ? { ...run, archived_at: archived ? new Date().toISOString() : null }
          : run,
      ),
    );
    setNotice(
      `Run #${runId} ${archived ? "archived. Find it in Archived." : "restored to Runs."}`,
    );
  };
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const active = runs.some((run) => ACTIVE.has(run.status));

  const cancelRun = async (runId: number) => {
    revision.current++;
    setCancelling(runId);
    setError("");
    try {
      const res = await fetch(
        `/api/projects/${projectId}/runs/${runId}/cancel`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error("Could not stop the run. Try again.");
      revision.current++;
      setRuns((prev) =>
        prev.map((run) =>
          run.id === runId ? { ...run, status: "cancelled" } : run,
        ),
      );
    } catch {
      setError("Could not stop the run. Try again.");
    } finally {
      setCancelling(null);
    }
  };

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const refresh = async () => {
      const startedAtRevision = revision.current;
      try {
        const res = await fetch(`/api/projects/${projectId}/runs`);
        if (!res.ok) throw new Error("Update failed");
        const data = (await res.json()) as { runs: RunRow[] };
        if (!cancelled && startedAtRevision === revision.current) {
          setRuns(data.runs);
          setStale(false);
        }
      } catch {
        if (!cancelled) setStale(true);
      }
    };
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, projectId]);

  if (!runs.length)
    return (
      <div className="mt-4 rounded-2xl border border-line bg-panel px-6 py-12 text-center">
        <p className="text-lg font-semibold">No runs yet</p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
          Launch your first swarm. Three agents will test your app and report
          what breaks.
        </p>
      </div>
    );
  return (
    <>
      <div
        className="mt-6 flex flex-wrap gap-1 border-b border-line pb-3"
        role="group"
        aria-label="Filter runs"
      >
        {(["current", "archived"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={view === option}
            onClick={() => setView(option)}
            className={`min-h-11 rounded-full px-4 text-sm font-medium ${view === option ? "bg-panel text-ink dark:text-white" : "text-muted hover:text-primary"}`}
          >
            {option === "current" ? "Runs" : "Archived"} (
            {
              runs.filter((run) =>
                option === "current" ? !run.archived_at : !!run.archived_at,
              ).length
            }
            )
          </button>
        ))}
      </div>
      {notice && (
        <p role="status" className="mt-4 text-sm text-muted">
          {notice}
        </p>
      )}
      {!visibleRuns.length && (
        <div className="mt-4 rounded-xl border border-line bg-panel px-6 py-10 text-center">
          <h3 className="font-semibold">
            {view === "archived" ? "No archived runs" : "No unarchived runs"}
          </h3>
          <p className="mt-2 text-sm text-muted">
            {view === "archived"
              ? "Archived runs stay available here with their reports and evidence."
              : "Start a new swarm, or restore a run from Archived."}
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {stale && (
        <p role="status" className="mt-4 text-sm text-muted">
          Updates are delayed. Reconnecting automatically…
        </p>
      )}
      <ul className="mt-4 space-y-3">
        {visibleRuns.map((run) => (
          <li
            key={run.id}
            className="flex min-w-0 flex-col gap-4 rounded-xl border border-line bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 flex-1">
              <a
                href={`/dashboard/projects/${projectId}/runs/${run.id}`}
                className="inline-flex min-h-11 items-center gap-2 font-medium underline-offset-4 hover:underline"
              >
                Run #{run.id}
              </a>
              <p className="text-sm text-muted">
                {new Date(run.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                {` · ${run.findingsCount} finding${run.findingsCount === 1 ? "" : "s"}`}
              </p>
              {run.target_url && (
                <p
                  title={run.target_url}
                  className="mt-1 truncate text-sm text-muted"
                >
                  {run.target_url}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-4 sm:shrink-0">
              <span className="flex items-center gap-2 text-sm capitalize text-muted">
                {ACTIVE.has(run.status) && (
                  <span
                    className="h-2 w-2 rounded-full bg-primary motion-safe:animate-pulse"
                    aria-hidden="true"
                  />
                )}
                {runStatusLabel(run.status)}
              </span>
              {ACTIVE.has(run.status) && (
                <button
                  type="button"
                  onClick={() => void cancelRun(run.id)}
                  disabled={cancelling !== null}
                  className="pressable min-h-11 rounded-full border border-line px-4 text-sm font-medium disabled:cursor-wait disabled:opacity-60"
                >
                  {cancelling === run.id ? "Stopping…" : "Stop"}
                </button>
              )}
              <RunArchiveButton
                projectId={projectId}
                runId={run.id}
                archived={!!run.archived_at}
                active={ACTIVE.has(run.status)}
                onChange={(archived) => updateArchive(run.id, archived)}
              />
              <a
                href={`/dashboard/projects/${projectId}/runs/${run.id}`}
                className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                View report
              </a>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
