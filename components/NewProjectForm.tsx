"use client";

import { useState } from "react";
import RepoPicker from "./RepoPicker";

const ERRORS: Record<string, string> = {
  "bad-url": "Enter a valid app URL starting with http:// or https://.",
  "bad-repo": "Pick a repository from the list or paste a valid github.com link.",
  "unowned-repo": "You can only connect repositories you own.",
  "no-repo": "Pick a repository first.",
};

/**
 * New-project form. The App URL autofills from the selected repository's
 * website (its GitHub "homepage") when it has one — until the user types
 * their own, which always wins.
 */
export default function NewProjectForm({
  action,
  error,
}: {
  action: (formData: FormData) => Promise<void>;
  error?: string;
}) {
  const [appUrl, setAppUrl] = useState("");
  const [urlTouched, setUrlTouched] = useState(false);

  const handleHomepage = (homepage: string | null) => {
    if (!homepage || urlTouched) return;
    const t = homepage.trim();
    // Only autofill something the URL field will actually accept.
    if (/^https?:\/\/.+\..+/.test(t)) setAppUrl(t);
  };

  return (
    <form action={action} className="mt-8 space-y-5">
      <div>
        <label
          htmlFor="appUrl"
          className="mb-1.5 block text-sm font-medium text-ink"
        >
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
          className="w-full rounded-xl border border-mist bg-white px-4 py-3 text-sm text-ink placeholder:text-ink/40 focus:border-ink/30 focus:outline-none"
        />
        <p className="mt-1.5 text-xs text-ink/40">
          Optional. Fills in automatically from the repository&apos;s website
          when it has one. If left empty, runs test the default
          branch&apos;s latest preview deployment.
        </p>
      </div>
      <RepoPicker name="repo" onHomepage={handleHomepage} />

      {error && ERRORS[error] ? (
        <p className="text-sm font-medium text-red-600">{ERRORS[error]}</p>
      ) : null}

      <button
        type="submit"
        className="pressable btn-gradient cursor-pointer rounded-full px-6 py-3 text-sm font-medium text-white"
      >
        Create project
      </button>
    </form>
  );
}
