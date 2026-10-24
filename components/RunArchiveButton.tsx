"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RunArchiveButton({
  projectId,
  runId,
  archived,
  active = false,
  onChange,
}: {
  projectId: number;
  runId: number;
  archived: boolean;
  active?: boolean;
  onChange?: (archived: boolean) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const update = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/projects/${projectId}/runs/${runId}/archive`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archived: !archived }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not update this run.");
      if (onChange) onChange(data.archived);
      else router.refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Connection lost. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => void update()}
        disabled={busy || active}
        title={active ? "Stop the run before archiving." : undefined}
        aria-label={`${archived ? "Restore" : "Archive"} run #${runId}`}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 9v11h16V9M3 4h18v5H3z" />
          {archived ? <path d="m9 15 3-3 3 3m-3-3v5" /> : <path d="M10 13h4" />}
        </svg>
        {busy
          ? archived
            ? "Restoring…"
            : "Archiving…"
          : archived
            ? "Restore"
            : "Archive"}
      </button>
      {error && (
        <p
          role="alert"
          className="mt-2 max-w-xs break-words text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      )}
    </div>
  );
}
