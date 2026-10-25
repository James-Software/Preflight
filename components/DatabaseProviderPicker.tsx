"use client";
import { useEffect, useState } from "react";
import type { DatabaseMetadata } from "@/lib/database-connections";
type Provider = "supabase" | "neon";
type Choice = { id: string; name: string };
export default function DatabaseProviderPicker({
  projectId,
  origin,
  initialProvider,
  onConnected,
}: {
  projectId: number;
  origin: string;
  initialProvider: Provider | null;
  onConnected: (connection: DatabaseMetadata) => void;
}) {
  const [provider, setProvider] = useState<Provider | null>(initialProvider);
  const [status, setStatus] = useState<{
    connected: boolean;
    oauth: boolean;
  } | null>(null);
  const [projects, setProjects] = useState<Choice[]>([]),
    [branches, setBranches] = useState<Choice[]>([]),
    [databases, setDatabases] = useState<Choice[]>([]),
    [roles, setRoles] = useState<Choice[]>([]);
  const [project, setProject] = useState(""),
    [branch, setBranch] = useState(""),
    [database, setDatabase] = useState(""),
    [role, setRole] = useState("");
  const [token, setToken] = useState(""),
    [password, setPassword] = useState(""),
    [useToken, setUseToken] = useState(false);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const field =
    "mt-2 min-h-11 w-full rounded-lg border border-line bg-page px-3 py-2 text-sm";
  const endpoint = provider ? `/api/database-providers/${provider}` : "";
  async function read(
    action?: string,
    extra: Record<string, string> = {},
    signal?: AbortSignal,
  ) {
    const query = new URLSearchParams({
      projectId: String(projectId),
      ...(action ? { action } : {}),
      ...extra,
    });
    const response = await fetch(`${endpoint}?${query}`, {
      cache: "no-store",
      signal,
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Could not load this account.");
    return data;
  }
  async function post(action: string, values: object = {}) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, projectId, ...values }),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Could not connect this account.");
    return data;
  }
  useEffect(() => {
    setStatus(null);
    setProjects([]);
    setBranches([]);
    setDatabases([]);
    setRoles([]);
    setProject("");
    setBranch("");
    setDatabase("");
    setRole("");
    setToken("");
    setPassword("");
    setUseToken(false);
    setError("");
    if (!provider) return;
    const controller = new AbortController();
    setBusy(true);
    void (async () => {
      try {
        const current = await read(undefined, {}, controller.signal);
        if (controller.signal.aborted) return;
        setStatus(current);
        if (current.connected) {
          const data = await read("projects", {}, controller.signal);
          if (!controller.signal.aborted) setProjects(data.projects);
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Could not load this account.",
          );
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    })();
    return () => controller.abort();
  }, [provider, projectId, retry]);
  async function authorize() {
    setBusy(true);
    setError("");
    try {
      const data = await post("authorize");
      window.location.assign(data.url);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not open account sign-in.",
      );
      setBusy(false);
    }
  }
  async function connectToken(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await post("token", { token });
      setToken("");
      setStatus({ connected: true, oauth: !!status?.oauth });
      setProjects(data.projects);
      setUseToken(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect account.");
    } finally {
      setBusy(false);
    }
  }
  async function chooseProject(value: string) {
    setProject(value);
    setBranch("");
    setDatabase("");
    setRole("");
    setPassword("");
    setBranches([]);
    setDatabases([]);
    setRoles([]);
    setError("");
    if (!value || provider !== "neon") return;
    setBusy(true);
    try {
      const data = await read("branches", { project: value });
      setBranches(data.branches);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load branches.");
    } finally {
      setBusy(false);
    }
  }
  async function chooseBranch(value: string) {
    setBranch(value);
    setDatabase("");
    setRole("");
    setDatabases([]);
    setRoles([]);
    setError("");
    if (!value) return;
    setBusy(true);
    try {
      const data = await read("databases", { project, branch: value });
      setDatabases(data.databases);
      setRoles(data.roles);
      if (data.databases.length === 1) setDatabase(data.databases[0].id);
      if (data.roles.length === 1) setRole(data.roles[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load databases.");
    } finally {
      setBusy(false);
    }
  }
  async function connectDatabase(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await post("select", {
        origin,
        project,
        ...(provider === "neon" ? { branch, database, role } : { password }),
      });
      setPassword("");
      onConnected(data.connection);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect database.");
    } finally {
      setBusy(false);
    }
  }
  async function disconnectAccount() {
    setBusy(true);
    setError("");
    try {
      await post("disconnect");
      setStatus({ connected: false, oauth: !!status?.oauth });
      setProjects([]);
      setProject("");
      setPassword("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not disconnect account.",
      );
    } finally {
      setBusy(false);
    }
  }
  const name = provider === "supabase" ? "Supabase" : "Neon";
  return (
    <section className="mt-5" aria-label="Connect a database provider">
      <h3 className="text-sm font-medium">Choose your database provider</h3>
      <div className="mt-3 flex flex-wrap gap-3">
        {(["supabase", "neon"] as const).map((p) => (
          <button
            type="button"
            key={p}
            disabled={busy}
            aria-pressed={provider === p}
            onClick={() => setProvider(p)}
            className={`pressable min-h-11 flex-1 cursor-pointer rounded-lg border px-5 py-2.5 text-sm font-medium disabled:cursor-wait disabled:opacity-60 sm:flex-none ${provider === p ? "border-primary bg-primary/10 text-primary enabled:hover:bg-primary/15" : "border-line bg-surface enabled:hover:border-primary/50 enabled:hover:bg-panel"}`}
          >
            {p === "supabase" ? "Supabase" : "Neon"}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {provider && (
        <div className="mt-5 rounded-lg border border-line bg-page p-4 sm:p-5">
          {!status ? (
            <p role="status" className="text-sm text-muted">
              {busy ? "Loading account…" : "Could not load account."}
              {!busy && (
                <button
                  type="button"
                  className="ml-3 min-h-11 text-primary"
                  onClick={() => setRetry((value) => value + 1)}
                >
                  Try again
                </button>
              )}
            </p>
          ) : status.connected ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium">{name} account connected</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void disconnectAccount()}
                  className="min-h-11 text-sm text-muted disabled:opacity-60"
                >
                  Disconnect account
                </button>
              </div>
              <form method="post" action={endpoint} onSubmit={connectDatabase}>
                <fieldset
                  disabled={busy}
                  className="mt-3 space-y-4 disabled:opacity-60"
                >
                  <label className="block text-sm">
                    Project
                    <select
                      required
                      value={project}
                      onChange={(e) => void chooseProject(e.target.value)}
                      className={field}
                    >
                      <option value="">Choose a project</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!projects.length && (
                    <p className="text-xs text-muted">
                      No projects available. Check this account’s permissions or
                      connect another account.
                    </p>
                  )}
                  {provider === "neon" && project && (
                    <>
                      <label className="block text-sm">
                        <span className="inline-flex items-center gap-2">
                          <svg
                            aria-hidden="true"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          >
                            <circle cx="6" cy="5" r="3" />
                            <circle cx="6" cy="19" r="3" />
                            <circle cx="18" cy="5" r="3" />
                            <path d="M6 8v8m12-8a8 8 0 0 1-8 8H6" />
                          </svg>
                          Branch
                        </span>
                        <select
                          required
                          value={branch}
                          onChange={(e) => void chooseBranch(e.target.value)}
                          className={field}
                        >
                          <option value="">Choose a branch</option>
                          {branches.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {branch && (
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="text-sm">
                            Database
                            <select
                              required
                              value={database}
                              onChange={(e) => setDatabase(e.target.value)}
                              className={field}
                            >
                              <option value="">Choose a database</option>
                              {databases.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-sm">
                            Database role
                            <select
                              required
                              value={role}
                              onChange={(e) => setRole(e.target.value)}
                              className={field}
                            >
                              <option value="">Choose a role</option>
                              {roles.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      )}
                    </>
                  )}
                  {provider === "supabase" && project && (
                    <label className="block text-sm">
                      Database password
                      <input
                        required
                        type="password"
                        value={password}
                        aria-label="Database password"
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="off"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        data-1p-ignore
                        data-lpignore="true"
                        className={field}
                      />
                      <span className="mt-2 block text-xs text-muted">
                        Supabase fills in the connection details. It cannot
                        return your existing database password.
                      </span>
                    </label>
                  )}
                  <p className="text-xs leading-relaxed text-muted">
                    Use the database for this app environment. PreFlight uses
                    read-only transactions; choose a read-only role when
                    available. Connecting doesn’t create verification checks.
                  </p>
                  <button
                    type="submit"
                    disabled={
                      !project ||
                      (provider === "neon" && (!branch || !database || !role))
                    }
                    className="btn-primary min-h-11 px-5 text-sm font-medium disabled:opacity-60"
                  >
                    {busy ? "Connecting…" : "Connect selected database"}
                  </button>
                </fieldset>
              </form>
            </>
          ) : (
            <>
              <p className="text-sm text-muted">
                Connect your {name} account to choose a database. Connection
                details stay hidden.
              </p>
              {status.oauth && !useToken ? (
                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void authorize()}
                    className="btn-primary min-h-11 px-5 text-sm font-medium"
                  >
                    Connect {name}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setUseToken(true)}
                    className="min-h-11 text-sm text-muted"
                  >
                    Use an access token instead
                  </button>
                </div>
              ) : (
                <form
                  method="post"
                  action={endpoint}
                  onSubmit={connectToken}
                  className="mt-4"
                >
                  <fieldset
                    disabled={busy}
                    className="space-y-3 disabled:opacity-60"
                  >
                    <label className="block text-sm">
                      {name} {provider === "neon" ? "API key" : "access token"}
                      <input
                        required
                        type="text"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        autoComplete="off"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        data-1p-ignore
                        data-lpignore="true"
                        className={field}
                      />
                    </label>
                    <a
                      href={
                        provider === "neon"
                          ? "https://console.neon.tech/app/settings/api-keys"
                          : "https://supabase.com/dashboard/account/tokens"
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center text-sm text-primary"
                    >
                      Get a {name}{" "}
                      {provider === "neon" ? "API key" : "access token"} ↗
                    </a>
                    <p className="text-xs text-muted">
                      Encrypted after connecting.{" "}
                      {provider === "neon" && !status.oauth
                        ? "Neon account sign-in requires partner approval; an API key works now."
                        : "Connect once, then reuse this account across your projects."}
                    </p>
                    <button
                      type="submit"
                      className="btn-primary min-h-11 px-5 text-sm font-medium"
                    >
                      {busy ? "Connecting…" : `Connect ${name} account`}
                    </button>
                  </fieldset>
                </form>
              )}
            </>
          )}
          {busy && status && (
            <p role="status" className="mt-3 text-xs text-muted">
              Loading database details…
            </p>
          )}
        </div>
      )}
    </section>
  );
}
