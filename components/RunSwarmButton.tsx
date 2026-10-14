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
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => void start()}
        disabled={busy}
        className="pressable btn-gradient cursor-pointer rounded-full px-5 py-2.5 text-sm font-medium text-white disabled:cursor-wait disabled:opacity-70"
      >
        {busy ? "Starting…" : "Run swarm"}
      </button>
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
