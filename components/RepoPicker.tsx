"use client";

import { reconnectGithub, githubReconnected } from "@/lib/github-reconnect";
import { useEffect, useMemo, useState } from "react";

type Repo = {
  fullName: string;
  private: boolean;
  defaultBranch: string;
  pushedAt: string | null;
};

type VerifyResponse =
  | {
      ok: true;
      fullName: string;
      private: boolean;
      homepage: string | null;
      appInstalled: boolean | null;
    }
  | { ok: false; error: string };

function parsePaste(input: string): string | null {
  const t = input.trim().replace(/\/+$/, "");
  const urlM = t.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\/.*)?$/i,
  );
  if (urlM) return urlM[1];
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(t)) return t;
  return null;
}

function errorMessage(data: unknown, fallback: string): string {
  if (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof (data as { error: unknown }).error === "string"
  ) {
    return (data as { error: string }).error;
  }
  return fallback;
}

export default function RepoPicker({
  name,
  onHomepage,
  onSelection,
  errorId,
  returnTo = "/dashboard/projects/new",
}: {
  name: string;
  returnTo?: string;
  onSelection?: (repo: string) => void;
  errorId?: string;
  onHomepage?: (homepage: string | null) => void;
}) {
  const [reload, setReload] = useState(0);
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [selectedPrivate, setSelectedPrivate] = useState(false);
  const [appInstalled, setAppInstalled] = useState<boolean | null>(null);
  // Account-level installation: without it the token only sees public repos.
  const [appMissing, setAppMissing] = useState(false);
  const [paste, setPaste] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setRepos(null);
    setLoadError("");
    setNeedsLogin(false);
    (async () => {
      try {
        const res = await fetch("/api/github/repos");
        const data = (await res.json()) as {
          repos?: Repo[];
          error?: string;
          tokenMissing?: boolean;
          tokenExpired?: boolean;
        };
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 401) {
            if (reconnectGithub(returnTo)) return;
            setNeedsLogin(true);
          }
          if (data.tokenMissing || data.tokenExpired) setNeedsLogin(true);
          setLoadError(data.error ?? "Could not load your repositories.");
          setRepos([]);
          return;
        }
        githubReconnected();
        setRepos(data.repos ?? []);
        // If the app isn't installed on their account, private repos are
        // invisible to the token — offer a one-click install.
        try {
          const instRes = await fetch("/api/github/installation");
          if (instRes.ok) {
            const inst = (await instRes.json()) as { installed?: boolean };
            if (cancelled) return;
            setAppMissing(inst.installed === false);
          }
        } catch {
          // Banner stays hidden on transient failure; public repos still work.
        }
      } catch {
        if (!cancelled) {
          setLoadError("Could not load your repositories.");
          setRepos([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload, returnTo]);

  const filtered = useMemo(() => {
    if (!repos) return [];
    const q = query.trim().toLowerCase();
    const list = q
      ? repos.filter((r) => r.fullName.toLowerCase().includes(q))
      : repos;
    return list.slice(0, 50);
  }, [repos, query]);

  const choose = async (fullName: string) => {
    setVerifyError("");
    setVerifying(true);
    try {
      const res = await fetch(
        `/api/github/repos/verify?repo=${encodeURIComponent(fullName)}`,
      );
      const data = (await res.json()) as VerifyResponse;
      if (!res.ok) {
        if (res.status === 401 && reconnectGithub(returnTo)) return;
        if (
          res.status === 401 ||
          "tokenMissing" in data ||
          "tokenExpired" in data
        ) {
          setNeedsLogin(true);
        }
        setVerifyError(errorMessage(data, "Could not verify the repository."));
        return;
      }
      if (!data.ok) {
        setVerifyError(data.error);
        return;
      }
      setSelected(data.fullName);
      onSelection?.(data.fullName);
      setSelectedPrivate(data.private);
      setAppInstalled(data.appInstalled);
      onHomepage?.(data.homepage ?? null);
    } catch {
      setVerifyError("Could not verify the repository.");
    } finally {
      setVerifying(false);
    }
  };

  const submitPaste = () => {
    const fullName = parsePaste(paste);
    if (!fullName) {
      setVerifyError("Paste a github.com/owner/repo link or owner/name.");
      return;
    }
    void choose(fullName);
  };

  return (
    <fieldset
      className="min-w-0"
      aria-describedby={errorId ? `repo-help ${errorId}` : "repo-help"}
      aria-invalid={!!errorId || undefined}
    >
      <legend className="mb-2 text-sm font-medium">GitHub repository</legend>
      <input type="hidden" name={name} value={selected} />

      {needsLogin ? (
        <div className="rounded-xl border px-4 py-3 text-sm text-ink/70 dark:text-white/70 border-line bg-panel">
          Your GitHub session expired.{" "}
          <button
            type="button"
            onClick={() => reconnectGithub(returnTo, true)}
            className="font-medium text-ink underline underline-offset-2 dark:text-white"
          >
            Reconnect GitHub
          </button>{" "}
          to pick a repository.
        </div>
      ) : repos === null ? (
        <div className="rounded-xl border px-4 py-3 text-sm text-muted dark:text-muted border-line">
          Loading your repositories…
        </div>
      ) : loadError ? (
        <div className="rounded-xl border px-4 py-3 text-sm text-ink/70 dark:text-white/70 border-line bg-panel">
          {loadError}
          <button
            type="button"
            onClick={() => setReload((value) => value + 1)}
            className="ml-2 inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {appMissing && (
            <div className="mb-3 rounded-xl border px-4 py-3 border-line bg-panel">
              <p className="text-sm font-medium text-ink dark:text-white">
                Want your private repositories here?
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted dark:text-muted">
                Install the PreFlight app on your GitHub account. One click, and
                you come right back to this list.
              </p>
              <a
                href="https://github.com/apps/preflight-qa/installations/new"
                className="pressable btn-primary mt-2 inline-block rounded-full px-4 py-2 text-xs font-medium text-white"
              >
                Install PreFlight on GitHub
              </a>
            </div>
          )}
          {repos.length === 0 ? (
            <div className="rounded-xl border px-4 py-3 text-sm text-muted dark:text-muted border-line">
              No repositories found on your GitHub account.
            </div>
          ) : (
            <>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your repositories…"
                aria-label="Search your repositories"
                className="w-full rounded-xl border bg-white px-4 py-3 text-sm text-ink placeholder:text-muted focus:border-ink/30 focus:outline-none dark:bg-white/5 dark:text-white dark:placeholder:text-muted dark:focus:border-white/30 border-line"
              />
              <ul className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-line">
                {filtered.map((r) => {
                  const active = selected === r.fullName;
                  return (
                    <li key={r.fullName}>
                      <label
                        className={`flex min-h-11 w-full cursor-pointer items-center gap-3 px-4 py-3 text-left text-sm ${active ? "bg-panel" : "hover:bg-panel"}`}
                      >
                        <input
                          type="radio"
                          name={`${name}-choice`}
                          value={r.fullName}
                          checked={active}
                          onChange={() => void choose(r.fullName)}
                          disabled={verifying}
                          className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                        />
                        <span className="min-w-0 flex-1 truncate font-medium text-ink dark:text-white">
                          {r.fullName}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            r.private
                              ? "bg-ink/5 text-muted dark:bg-white/10 dark:text-muted"
                              : "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"
                          }`}
                        >
                          {r.private ? "Private" : "Public"}
                        </span>
                      </label>
                    </li>
                  );
                })}
                {filtered.length === 0 && (
                  <li className="px-4 py-3 text-sm text-muted dark:text-muted">
                    No matches. Try pasting a link below.
                  </li>
                )}
              </ul>
            </>
          )}
        </>
      )}

      <div
        role="group"
        aria-label="Verify a repository link"
        className="mt-3 flex gap-2"
      >
        <input
          type="text"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder="Or paste a github.com link…"
          aria-label="Paste a GitHub repository link"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (!verifying) submitPaste();
            }
          }}
          disabled={verifying}
          className="min-w-0 flex-1 rounded-xl border bg-white px-4 py-3 text-sm text-ink placeholder:text-muted focus:border-ink/30 focus:outline-none disabled:opacity-60 dark:bg-white/5 dark:text-white dark:placeholder:text-muted dark:focus:border-white/30 border-line"
        />
        <button
          type="button"
          onClick={submitPaste}
          disabled={verifying}
          className="pressable shrink-0 cursor-pointer rounded-full border px-5 py-3 text-sm font-medium text-ink transition-colors duration-150 hover:bg-lavender disabled:cursor-wait disabled:opacity-60 dark:text-white dark:hover:bg-white/10 border-line"
        >
          {verifying ? "Checking…" : "Check"}
        </button>
      </div>

      {selected && (
        <div className="mt-3 rounded-xl border px-4 py-3 border-line bg-panel">
          <p className="text-sm font-medium text-ink dark:text-white">
            {selected}{" "}
            <span className="font-normal text-muted dark:text-muted">
              ({selectedPrivate ? "private" : "public"})
            </span>
          </p>
          {appInstalled === false && (
            <p className="mt-1.5 text-sm leading-relaxed text-muted dark:text-muted">
              The PreFlight GitHub App is not installed on this repo yet. You
              can create the project, but automatic fix PRs will not work until
              you install it.{" "}
              <a
                href="https://github.com/settings/installations"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-ink underline underline-offset-2 dark:text-white"
              >
                Manage installations
              </a>
            </p>
          )}
        </div>
      )}
      {verifyError && (
        <p
          role="alert"
          className="mt-2 text-sm font-medium text-red-600 dark:text-red-400"
        >
          {verifyError}
        </p>
      )}
      <p id="repo-help" className="mt-2 text-sm text-muted">
        Only repositories you own can be connected.
      </p>
    </fieldset>
  );
}
