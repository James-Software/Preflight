"use client";

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
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\/.*)?$/i
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
}: {
  name: string;
  onHomepage?: (homepage: string | null) => void;
}) {
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
          if (data.tokenMissing || data.tokenExpired) setNeedsLogin(true);
          setLoadError(
            data.error ?? "Could not load your repositories."
          );
          setRepos([]);
          return;
        }
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
  }, []);

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
        `/api/github/repos/verify?repo=${encodeURIComponent(fullName)}`
      );
      const data = (await res.json()) as VerifyResponse;
      if (!res.ok) {
        if ("tokenMissing" in data || "tokenExpired" in data) {
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
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink dark:text-white">
        GitHub repository
      </span>
      <input type="hidden" name={name} value={selected} />

      {needsLogin ? (
        <div className="rounded-xl border px-4 py-3 text-sm text-ink/70 dark:text-white/70 border-line bg-panel">
          Your GitHub session expired.{" "}
          <a href="/login" className="font-medium text-ink underline underline-offset-2 dark:text-white">
            Log in again
          </a>{" "}
          to pick a repository.
        </div>
      ) : repos === null ? (
        <div className="rounded-xl border px-4 py-3 text-sm text-ink/40 dark:text-white/40 border-line">
          Loading your repositories…
        </div>
      ) : loadError ? (
        <div className="rounded-xl border px-4 py-3 text-sm text-ink/70 dark:text-white/70 border-line bg-panel">
          {loadError}
        </div>
      ) : (
        <>
          {appMissing && (
            <div className="mb-3 rounded-xl border px-4 py-3 border-line bg-panel">
              <p className="text-sm font-medium text-ink dark:text-white">
                Want your private repositories here?
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink/60 dark:text-white/60">
                Install the PreFlight app on your GitHub account. One click,
                and you come right back to this list.
              </p>
              <a
                href="https://github.com/apps/preflight-qa/installations/new"
                className="pressable btn-gradient mt-2 inline-block rounded-full px-4 py-2 text-xs font-medium text-white"
              >
                Install PreFlight on GitHub
              </a>
            </div>
          )}
          {repos.length === 0 ? (
            <div className="rounded-xl border px-4 py-3 text-sm text-ink/60 dark:text-white/60 border-line">
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
            className="w-full rounded-xl border bg-white px-4 py-3 text-sm text-ink placeholder:text-ink/40 focus:border-ink/30 focus:outline-none dark:bg-white/5 dark:text-white dark:placeholder:text-white/40 dark:focus:border-white/30 border-line"
          />
          <ul className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-line">
            {filtered.map((r) => {
              const active = selected === r.fullName;
              return (
                <li key={r.fullName}>
                  <button
                    type="button"
                    onClick={() => void choose(r.fullName)}
                    disabled={verifying}
                    className={`pressable flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors duration-150 disabled:cursor-wait ${
                      active ? "bg-lavender dark:bg-white/10" : "hover:bg-lavender/50 dark:hover:bg-white/5"
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        active ? "border-primary" : "border-ink/25 dark:border-white/25"
                      }`}
                      aria-hidden="true"
                    >
                      {active && (
                        <span className="h-2 w-2 rounded-full bg-primary" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-ink dark:text-white">
                      {r.fullName}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        r.private
                          ? "bg-ink/5 text-ink/60 dark:bg-white/10 dark:text-white/60"
                          : "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"
                      }`}
                    >
                      {r.private ? "Private" : "Public"}
                    </span>
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-4 py-3 text-sm text-ink/40 dark:text-white/40">
                No matches. Try pasting a link below.
              </li>
            )}
          </ul>
            </>
          )}
        </>
      )}

      <div role="group" aria-label="Verify a repository link" className="mt-3 flex gap-2">
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
          className="min-w-0 flex-1 rounded-xl border bg-white px-4 py-3 text-sm text-ink placeholder:text-ink/40 focus:border-ink/30 focus:outline-none disabled:opacity-60 dark:bg-white/5 dark:text-white dark:placeholder:text-white/40 dark:focus:border-white/30 border-line"
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
            <span className="font-normal text-ink/50 dark:text-white/50">
              ({selectedPrivate ? "private" : "public"})
            </span>
          </p>
          {appInstalled === false && (
            <p className="mt-1.5 text-xs leading-relaxed text-ink/60 dark:text-white/60">
              The PreFlight GitHub App is not installed on this repo yet. You
              can create the project, but automatic fix PRs will not work
              until you install it.{" "}
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
        <p className="mt-2 text-sm font-medium text-red-600 dark:text-red-400">{verifyError}</p>
      )}
      <p className="mt-1.5 text-xs text-ink/40 dark:text-white/40">
        Only repositories you own can be connected.
      </p>
    </div>
  );
}
