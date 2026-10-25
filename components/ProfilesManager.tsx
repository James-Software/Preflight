"use client";
import { useEffect, useState } from "react";
import type { AuthProfile } from "@/lib/auth-profiles";

export default function ProfilesManager({
  initialProfiles,
  initialOrigin,
  returnTo,
}: {
  initialProfiles: AuthProfile[];
  initialOrigin: string;
  returnTo: string | null;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [creating, setCreating] = useState(
    !initialProfiles.length || !!initialOrigin,
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [remove, setRemove] = useState<number | null>(null);
  const field =
    "mt-2 min-h-11 w-full rounded-lg border border-line bg-page px-3 py-2 text-sm";
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not save the profile.");
      setSavedId(result.profile.id);
      setProfiles((previous) => [result.profile, ...previous]);
      form.reset();
      setCreating(false);
      setNotice("Profile saved. Choose it when you start a swarm.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection lost. Try again.");
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: number) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/profiles", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not remove profile.");
      setProfiles((previous) => previous.filter((p) => p.id !== id));
      setNotice("Profile removed. Future runs cannot use this profile.");
      setRemove(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection lost. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {profiles.length} saved profile{profiles.length === 1 ? "" : "s"}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {returnTo && (
            <a
              href={savedId ? `${returnTo}&profileId=${savedId}` : returnTo}
              className="inline-flex min-h-11 items-center text-sm font-medium text-primary"
            >
              ← Return to run setup
            </a>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => setCreating(true)}
            className="btn-primary min-h-11 px-5 text-sm font-medium"
          >
            New profile
          </button>
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-500/40 p-4 text-sm"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-4 text-sm text-muted">
          {notice}
        </p>
      )}
      {creating && (
        <form
          method="post"
          action="/api/profiles"
          onSubmit={save}
          className="mt-6 rounded-xl border border-line bg-surface p-5 sm:p-7"
        >
          <h2 className="text-lg font-semibold">Create profile</h2>
          <fieldset
            disabled={busy || !ready}
            className="mt-5 space-y-5 disabled:opacity-60"
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="text-sm font-medium">
                Profile name
                <input
                  name="name"
                  required
                  maxLength={80}
                  placeholder="Staging customer"
                  autoComplete="off"
                  className={field}
                />
              </label>
              <label className="text-sm font-medium">
                App origin
                <input
                  name="origin"
                  required
                  type="url"
                  defaultValue={initialOrigin}
                  placeholder="https://staging.example.com"
                  autoComplete="off"
                  className={field}
                />
              </label>
            </div>
            <div>
              <label
                htmlFor="profile-session"
                className="block text-sm font-medium"
              >
                Cookies or session JSON
              </label>
              <textarea
                id="profile-session"
                name="session"
                defaultValue="[]"
                rows={6}
                spellCheck={false}
                autoComplete="off"
                className={`${field} font-mono text-xs`}
                aria-describedby="session-help"
              />
              <span
                id="session-help"
                className="mt-2 block text-xs font-normal leading-relaxed text-muted"
              >
                Paste a browser cookie array or Playwright storage state with
                cookies and local storage. Cookies are limited to the app’s
                hostname.
              </span>
            </div>
            <details>
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
                Authentication headers
              </summary>
              <label className="block text-sm">
                Headers JSON
                <textarea
                  name="headers"
                  defaultValue="{}"
                  rows={4}
                  spellCheck={false}
                  autoComplete="off"
                  className={`${field} font-mono text-xs`}
                  placeholder={'{"Authorization":"Bearer …"}'}
                />
              </label>
              <p className="mt-2 text-xs text-muted">
                Optional. Headers are sent only to the app origin.
              </p>
            </details>
            <details>
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
                Check signed-in access
              </summary>
              <label className="mt-2 block text-sm">
                Signed-in page
                <input
                  name="verificationPath"
                  defaultValue="/"
                  placeholder="/dashboard"
                  className={field}
                />
              </label>
              <label className="mt-4 block text-sm">
                Text visible after sign-in{" "}
                <span className="text-muted">(optional)</span>
                <input
                  name="verificationText"
                  maxLength={200}
                  placeholder="Your workspace"
                  className={field}
                />
              </label>
              <p className="mt-2 text-xs text-muted">
                Use a protected page and a text marker for a reliable session
                check before agents begin.
              </p>
            </details>
            <p className="text-xs leading-relaxed text-muted">
              Use a test account. Session data is encrypted and cannot be viewed
              after saving. To refresh an expired session, create a replacement
              profile.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="min-h-11 rounded-full border border-line px-4 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary min-h-11 px-5 text-sm font-medium"
              >
                {busy ? "Saving…" : "Save profile"}
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {!!profiles.length && (
        <ul className="mt-6 divide-y divide-line">
          {profiles.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-start justify-between gap-4 py-6"
            >
              <div className="min-w-0">
                <h2 className="break-words font-semibold">{p.name}</h2>
                <p className="mt-1 break-all text-sm text-muted">{p.origin}</p>
                <p className="mt-2 text-xs text-muted">
                  Session values hidden · Check: {p.verification_path}
                </p>
              </div>
              <div>
                {remove === p.id ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm text-muted">Remove profile?</span>
                    <button
                      disabled={busy}
                      className="min-h-11 px-2 text-sm"
                      onClick={() => setRemove(null)}
                    >
                      Cancel
                    </button>
                    <button
                      disabled={busy}
                      className="min-h-11 px-2 text-sm font-medium text-red-700 dark:text-red-300"
                      onClick={() => void revoke(p.id)}
                    >
                      {busy ? "Removing…" : "Confirm removal"}
                    </button>
                  </div>
                ) : (
                  <button
                    disabled={busy}
                    className="min-h-11 px-3 text-sm text-muted hover:text-primary"
                    onClick={() => setRemove(p.id)}
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {!profiles.length && !creating && (
        <p className="mt-8 text-sm text-muted">
          No saved profiles. Create one to test signed-in pages, or run without
          a profile for public pages.
        </p>
      )}
    </>
  );
}
