"use client";

import { useActionState, useState } from "react";
import RepoPicker from "./RepoPicker";

export type ProjectFormState = {
  error: string;
  field?: "appUrl" | "repo";
} | null;
export type ProjectFormAction = (
  state: ProjectFormState,
  formData: FormData,
) => Promise<ProjectFormState>;
const ERRORS: Record<string, string> = {
  "bad-url": "Enter an app URL starting with http:// or https://.",
  "bad-repo": "Pick a repository or paste a valid GitHub link.",
  "unowned-repo": "You can only connect repositories you own.",
  "no-repo": "Pick a repository first.",
};
export default function NewProjectForm({
  action,
  error,
}: {
  action: ProjectFormAction;
  error?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [appUrl, setAppUrl] = useState("");
  const [selectedRepo, setSelectedRepo] = useState("");
  const [urlTouched, setUrlTouched] = useState(false);
  const message = state?.error || (error && ERRORS[error]);
  const urlError = state?.field === "appUrl";
  return (
    <form
      action={formAction}
      onReset={(event) => event.preventDefault()}
      aria-busy={pending}
      className="mt-8 space-y-6"
    >
      <fieldset disabled={pending} className="min-w-0 space-y-6">
        <div>
          <label htmlFor="appUrl" className="mb-2 block text-sm font-medium">
            App URL
          </label>
          <input
            id="appUrl"
            name="appUrl"
            type="url"
            placeholder="https://myapp.com"
            value={appUrl}
            onChange={(e) => {
              setAppUrl(e.target.value);
              setUrlTouched(e.target.value.trim() !== "");
            }}
            aria-invalid={urlError || undefined}
            aria-describedby={`app-url-help${urlError ? " project-error" : ""}`}
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base placeholder:text-muted focus:border-primary"
          />
          <p
            id="app-url-help"
            className="mt-2 text-sm leading-relaxed text-muted"
          >
            Optional. Leave blank to test the latest preview deployment of your
            default branch.
          </p>
        </div>
        <RepoPicker
          name="repo"
          onSelection={setSelectedRepo}
          errorId={state?.field === "repo" ? "project-error" : undefined}
          onHomepage={(homepage) => {
            if (
              homepage &&
              !urlTouched &&
              /^https?:\/\/.+\..+/.test(homepage.trim())
            )
              setAppUrl(homepage.trim());
          }}
        />
        {message && (
          <p
            id="project-error"
            role="alert"
            className="text-sm text-red-700 dark:text-red-300"
          >
            {message}
          </p>
        )}
        <button
          type="submit"
          disabled={pending || !selectedRepo}
          className="pressable btn-primary min-h-11 rounded-full px-6 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Creating project…" : "Create project"}
        </button>
      </fieldset>
    </form>
  );
}
