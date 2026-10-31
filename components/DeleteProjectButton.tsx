"use client";
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteProjectButton({
  projectId,
  name,
}: {
  projectId: number;
  name: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const pending = useRef(false);
  const title = useId();
  const description = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function remove() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.deleted !== true)
        throw new Error(body.error || "Could not delete this project.");
      dialog.current?.close();
      document.getElementById("projects-heading")?.focus();
      router.refresh();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not delete this project.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        aria-label={`Delete ${name}`}
        title={`Delete ${name}`}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-red-500/10 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:hover:text-red-300"
        onClick={() => {
          setError("");
          dialog.current?.showModal();
          cancel.current?.focus();
        }}
      >
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        >
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={title}
        aria-describedby={description}
        onCancel={(event) => {
          if (pending.current) event.preventDefault();
        }}
        className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl border border-line bg-surface p-6 text-ink shadow-xl backdrop:bg-black/50 dark:text-white"
      >
        <h2 id={title} className="break-words text-xl font-semibold">
          Delete “{name}”?
        </h2>
        <p id={description} className="mt-4 text-sm leading-relaxed text-muted">
          This permanently removes the project, its runs, findings, saved
          profiles, connections and shared demo workspaces from PreFlight. Your
          GitHub repository, deployed app and application database stay intact.
        </p>
        {error && (
          <p
            role="alert"
            className="mt-4 text-sm text-red-600 dark:text-red-300"
          >
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancel}
            type="button"
            disabled={busy}
            onClick={() => dialog.current?.close()}
            className="min-h-11 rounded-lg border border-line px-4 text-sm disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            aria-busy={busy}
            onClick={() => void remove()}
            className="min-h-11 rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Delete project"}
          </button>
        </div>
      </dialog>
    </>
  );
}
