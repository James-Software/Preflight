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
      <div className="workspace-empty mt-6">
        <h2 className="text-base font-medium">No runs yet</h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
          Start a swarm to test your app and collect findings.
        </p>
      </div>
    );
  return (
    <>
      <div className="run-filters" role="group" aria-label="Filter runs">
        {(["current", "archived"] as const).map((option) => {
          const label = option === "current" ? "Runs" : "Archived";
          const count = runs.filter((run) => option === "current" ? !run.archived_at : !!run.archived_at).length;
          return (
            <button key={option} type="button" aria-pressed={view === option}
              aria-label={`${label} (${count})`} onClick={() => setView(option)}>
              {label}<span aria-hidden="true" className="text-xs text-muted">{count}</span>
            </button>
          );
        })}
      </div>
      {notice && <p role="status" className="mt-4 text-sm text-muted">{notice}</p>}
      {!visibleRuns.length && (
        <div className="workspace-empty">
          <h2 className="text-base font-medium">{view === "archived" ? "No archived runs" : "No unarchived runs"}</h2>
          <p className="mt-2 text-sm text-muted">
            {view === "archived" ? "Archived reports stay available here." : "Start a new swarm, or restore a run from Archived."}
          </p>
        </div>
      )}
      {error && <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-300">{error}</p>}
      {stale && <p role="status" className="mt-4 text-sm text-muted">Updates are delayed. Reconnecting automatically…</p>}
      <ul className="run-list" hidden={!visibleRuns.length}>
        {visibleRuns.map((run) => (
          <li key={run.id} className="run-row">
            <a href={`/dashboard/projects/${projectId}/runs/${run.id}`} className="run-row-link group" title={run.target_url || undefined}>
              <span className="run-row-heading">
                <span className="font-medium group-hover:underline underline-offset-4">Run #{run.id}</span>
                <span className={`run-row-status ${["failed", "partial"].includes(run.status) ? "text-red-700 dark:text-red-300" : "text-muted"}`}>
                  {ACTIVE.has(run.status) && <span className="size-1.5 shrink-0 rounded-full bg-primary motion-safe:animate-pulse" aria-hidden="true" />}
                  {runStatusLabel(run.status)}
                </span>
              </span>
              <span className="run-row-meta">
                <time dateTime={run.created_at}>{new Date(run.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</time>
                <span aria-hidden="true">·</span>
                <span>{run.findingsCount} finding{run.findingsCount === 1 ? "" : "s"}</span>
              </span>
              {run.target_url && <span className="sr-only">Tested {run.target_url}</span>}
            </a>
            <div className="run-row-actions">
              {ACTIVE.has(run.status) ? (
                <button type="button" onClick={() => void cancelRun(run.id)} disabled={cancelling !== null}
                  className="min-h-11 rounded-lg px-3 text-sm text-muted hover:bg-panel hover:text-primary disabled:cursor-wait disabled:opacity-60">
                  {cancelling === run.id ? "Stopping…" : "Stop"}
                </button>
              ) : (
                <RunArchiveButton projectId={projectId} runId={run.id} archived={!!run.archived_at}
                  onChange={(archived) => updateArchive(run.id, archived)} />
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
