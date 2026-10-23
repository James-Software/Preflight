"use client";

import { useState } from "react";

export default function RunSwarmButton({ projectId }: { projectId: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/runs`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Could not start the run.");
      }
      // The runs list polls and will pick the new run up.
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the run.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-w-0 max-w-full flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => void start()}
        disabled={busy}
        className="pressable btn-gradient cursor-pointer rounded-full px-5 py-2.5 text-sm font-medium text-white disabled:cursor-wait disabled:opacity-70"
      >
        {busy ? "Starting…" : "Run swarm"}
      </button>
      {error && (
        <div
          role="alert"
          className="max-w-sm text-sm text-red-700 dark:text-red-300"
        >
          <p className="break-words">{error}</p>
          <a
            href="#project-settings"
            onClick={() =>
              document
                .getElementById("project-settings")
                ?.setAttribute("open", "")
            }
            className="inline-flex min-h-11 items-center font-medium underline underline-offset-4"
          >
            Edit app URL
          </a>
        </div>
      )}
    </div>
  );
}
