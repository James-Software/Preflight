"use client";
import { useRouter } from "next/navigation";
import type { CleanupRun } from "@/lib/database-cleanup";
export default function CleanupRunPicker({
  projectId,
  runs,
  selected,
}: {
  projectId: number;
  runs: CleanupRun[];
  selected: number;
}) {
  const router = useRouter();
  return (
    <label className="mt-6 block max-w-lg text-sm font-medium">
      Run
      <select
        className="mt-2 min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm"
        value={selected}
        onChange={(event) =>
          router.push(
            `/dashboard/projects/${projectId}/cleanup?run=${event.target.value}`,
          )
        }
      >
        {runs.map((run) => (
          <option key={run.id} value={run.id}>
            Run #{run.id} · {run.status} · {run.pending_count} awaiting review
          </option>
        ))}
      </select>
    </label>
  );
}
