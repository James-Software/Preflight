"use client";

import { useEffect, useRef, useState } from "react";
import { reconnectGithub, githubReconnected } from "@/lib/github-reconnect";
import { BranchIcon, PullRequestIcon } from "@/components/GitIcons";
import type { TargetOption } from "@/lib/run-targets";
import type { AuthProfile } from "@/lib/auth-profiles";

const optionKey = (target: TargetOption) =>
  target.type === "branch" ? `branch:${target.ref}` : `pr:${target.number}`;
export default function RunSwarmButton({ projectId }: { projectId: number }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [targetError, setTargetError] = useState("");
  const [options, setOptions] = useState<TargetOption[]>([]),
    [profiles, setProfiles] = useState<AuthProfile[]>([]);
  const [selected, setSelected] = useState<TargetOption | null>(null),
    [filter, setFilter] = useState<"branch" | "pull-request">("branch"),
    [search, setSearch] = useState("");
  const [profileId, setProfileId] = useState(""),
    [targetUrl, setTargetUrl] = useState(""),
    [resolving, setResolving] = useState(false),
    [truncated, setTruncated] = useState(false);
  const [database, setDatabase] = useState<{ check_count: number } | null>(
    null,
  );
  const [verifyDatabase, setVerifyDatabase] = useState(false);
  const [databaseLocked, setDatabaseLocked] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [reauthFailed, setReauthFailed] = useState(false);
  const [canManageProfiles, setCanManageProfiles] = useState(true);
  const redirecting = useRef(false);
  function renewConnection(force = false) {
    if (redirecting.current && !force) return true;
    const back = new URL(window.location.href);
    back.searchParams.set("configureRun", "1");
    if (selected) back.searchParams.set("target", optionKey(selected));
    const chosenProfile = selected
      ? profileId
      : back.searchParams.get("profileId");
    if (chosenProfile) back.searchParams.set("profileId", chosenProfile);
    else back.searchParams.delete("profileId");
    if (reconnectGithub(back.pathname + back.search, force)) {
      redirecting.current = true;
      setReconnecting(true);
      setError("");
      return true;
    }
    setReauthFailed(true);
    setError(
      "GitHub couldn’t reconnect this account. Reconnect once more or check your GitHub app access.",
    );
    return false;
  }
  const draftKey = `preflight:run-setup:${projectId}`;
  async function load() {
    setLoading(true);
    setOptions([]);
    setProfiles([]);
    setSelected(null);
    setError("");
    setTargetUrl("");
    setDatabase(null);
    setDatabaseLocked(false);
    setVerifyDatabase(false);
    setTargetError("");
    setSearch("");
    try {
      const response = await fetch(`/api/projects/${projectId}/run-options`);
      const data = await response.json();
      if (response.status === 401) {
        renewConnection();
        return;
      }
      if (!response.ok)
        throw new Error(data.error || "Could not load run options.");
      githubReconnected();
      setOptions(data.options);
      setProfiles(data.profiles);
      setCanManageProfiles(data.canManageProfiles !== false);
      setTruncated(data.truncated);
      let key = "";
      try {
        key =
          new URLSearchParams(location.search).get("target") ||
          sessionStorage.getItem(draftKey) ||
          "";
      } catch {}
      const initial =
        data.options.find((t: TargetOption) => optionKey(t) === key) ||
        data.options.find((t: TargetOption) => t.isDefault) ||
        data.options[0];
      setSelected(initial || null);
      setFilter(initial?.type || "branch");
      const queryProfile = new URLSearchParams(location.search).get(
        "profileId",
      );
      setProfileId(
        data.profiles.some((p: AuthProfile) => String(p.id) === queryProfile)
          ? queryProfile || ""
          : "",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load run options.");
    } finally {
      setLoading(false);
    }
  }
  function show() {
    dialog.current?.showModal();
    dialog.current?.querySelector("h2")?.focus();
    setOpen(true);
    void load();
  }
  useEffect(() => {
    if (new URLSearchParams(location.search).get("configureRun") === "1")
      show();
  }, []); // Return from profile creation.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);
  useEffect(() => {
    if (!open || !selected) return;
    const controller = new AbortController();
    setResolving(true);
    setTargetUrl("");
    setDatabase(null);
    setDatabaseLocked(false);
    setVerifyDatabase(false);
    setTargetError("");
    const query = new URLSearchParams({
      type: selected.type,
      ...(selected.type === "branch"
        ? { ref: selected.ref }
        : { number: String(selected.number) }),
    });
    void (async () => {
      try {
        const response = await fetch(
          `/api/projects/${projectId}/run-options?${query}`,
          { signal: controller.signal },
        );
        const data = await response.json();
        if (response.status === 401) {
          if (!controller.signal.aborted) renewConnection();
          return;
        }
        if (!response.ok)
          throw new Error(data.error || "This deployment is unavailable.");
        if (!controller.signal.aborted) {
          setTargetUrl(data.target.url);
          setDatabase(data.database || null);
          setVerifyDatabase(!!data.database);
          setProfileId((previous) =>
            profiles.some(
              (p) =>
                String(p.id) === previous &&
                p.origin === new URL(data.target.url).origin,
            )
              ? previous
              : "",
          );
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setTargetError(
            e instanceof Error
              ? e.message
              : "Could not resolve this deployment.",
          );
      } finally {
        if (!controller.signal.aborted) setResolving(false);
      }
    })();
    return () => controller.abort();
  }, [open, selected, projectId, profiles]);
  const matchingProfiles = profiles.filter((p) => {
    try {
      return p.origin === new URL(targetUrl).origin;
    } catch {
      return false;
    }
  });
  const visible = options.filter(
    (t) =>
      t.type === filter &&
      `${t.label} ${t.ref} ${t.number || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  async function start(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !targetUrl || resolving) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target:
            selected.type === "branch"
              ? { type: "branch", ref: selected.ref }
              : { type: "pull-request", number: selected.number },
          profileId: profileId ? Number(profileId) : null,
          ...(database ? { verifyDatabase } : {}),
        }),
      });
      const data = await response.json();
      if (response.status === 401) {
        if (!renewConnection()) setBusy(false);
        return;
      }
      if (!response.ok) {
        setDatabaseLocked(data.code === "DATABASE_CONNECTION_LOCKED");
        throw new Error(data.error || "Could not start the run.");
      }
      window.location.assign(
        `/dashboard/projects/${projectId}/runs/${data.run.id}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the run.");
      setBusy(false);
    }
  }
  const createUrl = `/dashboard/projects/${projectId}/profiles?${new URLSearchParams({ returnToRun: "1", ...(targetUrl ? { origin: new URL(targetUrl).origin } : {}) })}`;
  return (
    <>
      <button
        type="button"
        onClick={show}
        className="pressable btn-primary shrink-0 rounded-full px-5 py-2.5 text-sm font-medium"
      >
        Run swarm
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={`run-setup-${projectId}`}
        onClose={() => {
          setOpen(false);
          setBusy(false);
        }}
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
        className="m-auto max-h-[90svh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-line bg-page p-0 text-ink shadow-xl backdrop:bg-black/50 dark:text-white"
      >
        <form onSubmit={start}>
          <div className="flex items-start justify-between gap-5 px-6 pt-6">
            <div>
              <h2
                id={`run-setup-${projectId}`}
                tabIndex={-1}
                className="text-xl font-semibold tracking-tight"
                style={{ outline: "none" }}
              >
                Start a swarm
              </h2>
              <p className="mt-2 text-sm text-muted">
                Choose what to test and how to sign in.
              </p>
            </div>
            <button
              type="button"
              aria-label="Close run setup"
              disabled={busy}
              onClick={() => dialog.current?.close()}
              className="-mr-2 -mt-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-panel disabled:opacity-50"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                aria-hidden="true"
              >
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <div className="space-y-6 px-6 pb-6 pt-6">
            {loading || reconnecting ? (
              <p role="status" className="py-8 text-sm text-muted">
                {reconnecting
                  ? "Reconnecting GitHub…"
                  : "Loading branches, PRs and profiles…"}
              </p>
            ) : options.length > 0 ? (
              <>
                <fieldset disabled={busy}>
                  <legend className="text-sm font-semibold">Deployment</legend>
                  <div
                    className="mt-3 flex gap-1 rounded-lg bg-panel p-1"
                    role="group"
                    aria-label="Filter deployment targets"
                  >
                    {(["branch", "pull-request"] as const).map((type) => (
                      <button
                        type="button"
                        key={type}
                        aria-pressed={filter === type}
                        onClick={() => {
                          setFilter(type);
                          setSearch("");
                        }}
                        className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium ${filter === type ? "bg-surface text-ink dark:text-white" : "text-muted"}`}
                      >
                        {type === "branch" ? (
                          <BranchIcon />
                        ) : (
                          <PullRequestIcon />
                        )}
                        {type === "branch" ? "Branches" : "Pull requests"}
                      </button>
                    ))}
                  </div>
                  <input
                    type="search"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.preventDefault();
                    }}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label={
                      filter === "branch"
                        ? "Search branches"
                        : "Search pull requests"
                    }
                    placeholder={
                      filter === "branch"
                        ? "Search branches…"
                        : "Search pull requests…"
                    }
                    className="mt-3 min-h-11 w-full rounded-lg border border-line bg-page px-3 text-sm"
                  />
                  <div
                    className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-line p-1"
                    role="group"
                    aria-label={
                      filter === "branch" ? "Branches" : "Pull requests"
                    }
                  >
                    {visible.map((target) => (
                      <label
                        key={optionKey(target)}
                        className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-md px-3 py-2 ${selected && optionKey(selected) === optionKey(target) ? "bg-panel" : "hover:bg-panel/60"}`}
                      >
                        <input
                          type="radio"
                          name={`target-${projectId}`}
                          checked={
                            !!selected &&
                            optionKey(selected) === optionKey(target)
                          }
                          onChange={() => {
                            setTargetUrl("");
                            setSelected(target);
                            try {
                              sessionStorage.setItem(
                                draftKey,
                                optionKey(target),
                              );
                            } catch {}
                          }}
                          className="size-4 shrink-0 accent-primary"
                        />
                        <span className="min-w-0 flex-1 break-words text-sm">
                          {target.type === "pull-request" && (
                            <span className="mr-2 text-muted">
                              #{target.number}{" "}
                            </span>
                          )}
                          {target.label}{" "}
                          {target.type === "pull-request" && (
                            <span className="mt-0.5 block break-all text-xs text-muted">
                              {target.ref}
                            </span>
                          )}
                        </span>
                        {target.isDefault && (
                          <span className="text-xs text-muted">Default</span>
                        )}
                      </label>
                    ))}
                    {!visible.length && (
                      <p className="px-3 py-5 text-sm text-muted">
                        {search
                          ? "No matching targets."
                          : filter === "pull-request"
                            ? "No open pull requests."
                            : "No branches available."}
                      </p>
                    )}
                  </div>
                  {truncated && (
                    <p className="mt-2 text-xs text-muted">
                      Showing up to 100 branches and the 100 most recently
                      updated open PRs.
                    </p>
                  )}
                  {selected && (
                    <p className="mt-3 flex items-center gap-2 break-words text-xs text-muted">
                      {selected.type === "branch" ? (
                        <BranchIcon />
                      ) : (
                        <PullRequestIcon />
                      )}
                      Selected:{" "}
                      {selected.type === "pull-request"
                        ? `#${selected.number} · `
                        : ""}
                      {selected.ref}
                    </p>
                  )}
                  {resolving && (
                    <p role="status" className="mt-2 text-xs text-muted">
                      Finding deployment…
                    </p>
                  )}
                  {targetUrl && (
                    <p className="mt-2 break-all text-xs text-muted">
                      {targetUrl}
                    </p>
                  )}
                  {targetError && (
                    <p
                      role="alert"
                      className="mt-3 text-sm text-red-700 dark:text-red-300"
                    >
                      {targetError}
                    </p>
                  )}
                </fieldset>
                <fieldset disabled={busy}>
                  <div className="flex items-center justify-between gap-3">
                    <label
                      htmlFor={`run-profile-${projectId}`}
                      className="text-sm font-semibold"
                    >
                      Authentication profile
                    </label>
                    {canManageProfiles && <a
                      href={createUrl}
                      aria-disabled={busy}
                      onClick={(e) => {
                        if (busy) e.preventDefault();
                      }}
                      className="pressable inline-flex min-h-11 items-center text-sm font-medium text-primary"
                    >
                      Generate profile
                    </a>}
                  </div>
                  <select
                    id={`run-profile-${projectId}`}
                    value={profileId || ""}
                    onChange={(e) => setProfileId(e.target.value)}
                    disabled={busy || resolving || !targetUrl}
                    className="min-h-11 w-full rounded-lg border border-line bg-page px-3 text-sm"
                  >
                    <option value="">No profile · Public pages</option>
                    {matchingProfiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs leading-relaxed text-muted">
                    {matchingProfiles.length
                      ? "Saved cookies and headers will be used only for this app origin."
                      : canManageProfiles ? "Test public pages without a profile, or generate a test account for signed-in pages." : "The owner can add a test account for signed-in pages."}
                  </p>
                </fieldset>
                {database && (
                  <label className="flex items-start gap-3 rounded-lg border border-line p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={verifyDatabase}
                      onChange={(event) =>
                        setVerifyDatabase(event.target.checked)
                      }
                      disabled={busy}
                      className="mt-0.5 size-4 shrink-0 accent-primary"
                    />
                    <span>
                      Verify database changes
                      <span className="mt-1 block text-xs leading-relaxed text-muted">
                        Agents automatically inspect uniquely marked test
                        records after app actions. Review cleanup SQL at the
                        end. Any advanced checks also run.
                      </span>
                    </span>
                  </label>
                )}
              </>
            ) : null}
            <p className="mt-4 text-xs leading-relaxed text-muted">
              Use a preview deployment and a test account. Database verification
              can create marked test records. Screenshots and page content are
              processed by AI providers; saved evidence is private to your project.
            </p>
            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-500/40 p-3 text-sm"
              >
                {error}
                {databaseLocked && (
                  <a
                    className="pressable mt-2 inline-flex min-h-11 items-center rounded-lg px-2 font-medium text-primary hover:bg-panel"
                    href={`/dashboard/projects/${projectId}/database#database-settings`}
                  >
                    Reconnect database →
                  </a>
                )}
                {(reauthFailed || !options.length) && (
                  <button
                    type="button"
                    className="ml-2 min-h-11 font-medium text-primary underline"
                    onClick={() =>
                      reauthFailed ? renewConnection(true) : void load()
                    }
                  >
                    {reauthFailed ? "Reconnect GitHub" : "Try again"}
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-line bg-page px-6 py-4">
            <button
              type="button"
              disabled={busy}
              onClick={() => dialog.current?.close()}
              className="min-h-11 rounded-full border border-line px-4 text-sm disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                loading ||
                reconnecting ||
                busy ||
                resolving ||
                !selected ||
                !targetUrl
              }
              className="btn-primary min-h-11 rounded-full px-5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Starting…" : "Start swarm"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
