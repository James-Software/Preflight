"use client";

import { useEffect, useState } from "react";

export type RunRow = {
  id: number;
  status: string;
  created_at: string;
  target_url: string | null;
  findingsCount: number;
};

const ACTIVE = new Set(["queued", "planning", "planned", "running"]);

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function RunsList({
  projectId,
  initialRuns,
}: {
  projectId: number;
  initialRuns: RunRow[];
}) {
  const [runs, setRuns] = useState<RunRow[]>(initialRuns);
  const [cancelling, setCancelling] = useState<number | null>(null);

  const cancelRun = async (runId: number) => {
    setCancelling(runId);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/runs/${runId}/cancel`,
        { method: "POST" }
      );
      if (res.ok) {
        setRuns((prev) =>
          prev.map((r) =>
            r.id === runId ? { ...r, status: "cancelled" } : r
          )
        );
      }
    } catch {
      // keep the row as-is; user can retry
    } finally {
      setCancelling(null);
    }
  };

  useEffect(() => {
    if (!runs.some((r) => ACTIVE.has(r.status))) return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/runs`);
        if (res.ok) {
          const data = (await res.json()) as { runs: RunRow[] };
          setRuns(data.runs);
        }
      } catch {
        // keep polling
      }
    }, 5000);
    return () => clearInterval(t);
  }, [runs, projectId]);

  if (runs.length === 0) {
    return (
      <div className="mt-4 rounded-2xl border border-mist bg-lavender/50 px-8 py-14 text-center dark:border-white/10 dark:bg-white/5">
        <p className="font-display text-lg font-bold text-ink dark:text-white">No runs yet</p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink/60 dark:text-white/60">
          Launch your first swarm. Three agents will test your app like real
          users and report what breaks.
        </p>
      </div>
    );
  }

  return (
    <ul className="mt-4 space-y-3">
      {runs.map((run) => (
        <li
          key={run.id}
          className="flex items-center justify-between rounded-xl border border-mist bg-white px-5 py-4 dark:border-white/10 dark:bg-[#0a0c14]"
        >
          <div>
            <p className="text-sm font-medium text-ink dark:text-white">Run #{run.id}</p>
            <p className="mt-0.5 text-xs text-ink/50 dark:text-white/50">
              {formatDate(run.created_at)}
              {run.findingsCount > 0 &&
                ` · ${run.findingsCount} finding${run.findingsCount === 1 ? "" : "s"}`}
            </p>
            {run.target_url && (
              <p className="mt-0.5 max-w-[20rem] truncate text-xs text-ink/40 dark:text-white/40">
                {run.target_url}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {ACTIVE.has(run.status) && (
              <button
                type="button"
                onClick={() => void cancelRun(run.id)}
                disabled={cancelling === run.id}
                className="pressable cursor-pointer rounded-full border border-mist px-3 py-1 text-xs font-medium text-ink/60 transition-colors duration-150 hover:border-ink/30 hover:text-ink disabled:cursor-wait disabled:opacity-60 dark:border-white/10 dark:text-white/60 dark:hover:border-white/30 dark:hover:text-white"
              >
                {cancelling === run.id ? "Stopping…" : "Stop"}
              </button>
            )}
            <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink/50 dark:text-white/50">
              {ACTIVE.has(run.status) && (
                <span
                  className="h-2 w-2 animate-pulse rounded-full bg-primary"
                  aria-hidden="true"
                />
              )}
              {run.status}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
