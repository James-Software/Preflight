"use client";

import { useActionState, useState } from "react";

export type ProjectUrlState = { error?: string; saved?: boolean } | null;
export type ProjectUrlAction = (
  previous: ProjectUrlState,
  formData: FormData,
) => Promise<ProjectUrlState>;
export default function ProjectUrlForm({
  action,
  initialUrl,
}: {
  action: ProjectUrlAction;
  initialUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [url, setUrl] = useState(initialUrl ?? "");
  return (
    <details id="project-settings" className="mt-8 rounded-xl bg-panel p-5">
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
        Edit app URL
      </summary>
      <form
        action={formAction}
        onReset={(event) => event.preventDefault()}
        className="mt-4 max-w-xl space-y-4"
        aria-busy={pending}
      >
        <div>
          <label htmlFor="project-app-url" className="text-sm font-medium">
            App URL
          </label>
          <input
            id="project-app-url"
            name="appUrl"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={pending}
            aria-invalid={!!state?.error || undefined}
            aria-describedby="project-url-help project-url-result"
            placeholder="https://myapp.com"
            className="mt-2 w-full rounded-xl border border-line bg-surface px-4 py-3 text-base placeholder:text-muted"
          />
          <p id="project-url-help" className="mt-2 text-sm text-muted">
            Leave blank to use the latest preview deployment of the default
            branch.
          </p>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="pressable btn-gradient min-h-11 rounded-full px-5 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save app URL"}
        </button>
        <p
          id="project-url-result"
          role={state?.error ? "alert" : "status"}
          className={`text-sm ${state?.error ? "text-red-700 dark:text-red-300" : "text-muted"}`}
        >
          {state?.error ||
            (state?.saved
              ? "App URL saved. Future runs will use this setting."
              : "")}
        </p>
      </form>
    </details>
  );
}
