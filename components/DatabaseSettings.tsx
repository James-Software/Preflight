"use client";
import { useEffect, useState } from "react";
import DatabaseProviderPicker from "@/components/DatabaseProviderPicker";
import type { DatabaseMetadata } from "@/lib/database-connections";

type DraftCheck = {
  id?: string;
  title: string;
  instructions: string;
  buttonLabel: string;
  query: string;
  operator: "equals" | "changes" | "increases" | "decreases";
  expectedText: string;
};
const blankCheck = (): DraftCheck => ({
  title: "",
  instructions: "",
  buttonLabel: "",
  query: "",
  operator: "equals",
  expectedText: "1",
});
export default function DatabaseSettings({
  projectId,
  initialConnections,
  defaultOrigin,
  expanded = false,
}: {
  projectId: number;
  initialConnections: DatabaseMetadata[];
  defaultOrigin: string;
  expanded?: boolean;
}) {
  const [connections, setConnections] = useState(initialConnections),
    [editing, setEditing] = useState(false),
    [id, setId] = useState<number | null>(null);
  const [origin, setOrigin] = useState(defaultOrigin),
    [url, setUrl] = useState(""),
    [checks, setChecks] = useState<DraftCheck[]>([]);
  const [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [remove, setRemove] = useState<number | null>(null);
  const [initialProvider, setInitialProvider] = useState<
    "supabase" | "neon" | null
  >(null);
  const [autoOpen, setAutoOpen] = useState(false);
  useEffect(() => {
    setReady(true);
    const current = new URL(window.location.href);
    const connected = current.searchParams.get("databaseProvider");
    const failed = current.searchParams.get("databaseProviderError");
    const provider = connected || failed;
    if (provider === "supabase" || provider === "neon") {
      setInitialProvider(provider);
      setAutoOpen(true);
      setEditing(true);
      if (failed)
        setError(
          "Account connection was cancelled or could not be completed. Try again.",
        );
      current.searchParams.delete("databaseProvider");
      current.searchParams.delete("databaseProviderError");
      window.history.replaceState(null, "", current.href);
    }
  }, []);
  const field =
    "mt-2 min-h-11 w-full rounded-lg border border-line bg-page px-3 py-2 text-sm";
  const endpoint = `/api/projects/${projectId}/database`;
  function update(index: number, values: Partial<DraftCheck>) {
    setChecks((previous) =>
      previous.map((check, i) =>
        i === index ? { ...check, ...values } : check,
      ),
    );
  }
  function newConnection() {
    setId(null);
    setOrigin(defaultOrigin);
    setUrl("");
    setChecks([]);
    setError("");
    setEditing(true);
  }
  async function reconnect(connection: DatabaseMetadata) {
    setError("");
    setNotice("");
    let savedChecks: DraftCheck[] = [];
    if (connection.check_count > 0) {
      setBusy(true);
      try {
        const response = await fetch(`${endpoint}?connection=${connection.id}`);
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            "Restore the original encryption key to keep this connection’s advanced checks. To replace those checks, disconnect this saved connection first, then reconnect.",
          );
        savedChecks = data.settings.checks.map((check: any) => ({
          ...check,
          expectedText: JSON.stringify(check.expected),
        }));
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "Could not load existing checks.",
        );
        return;
      } finally {
        setBusy(false);
      }
    }
    setId(null);
    setOrigin(connection.origin);
    setUrl("");
    setChecks(savedChecks);
    setEditing(true);
    setNotice(
      "Select your database again or enter a fresh connection URL. This replaces PreFlight’s saved connection without deleting database records.",
    );
  }
  async function edit(connection: number) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${endpoint}?connection=${connection}`),
        data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load checks.");
      setId(data.settings.id);
      setOrigin(data.settings.origin);
      setUrl("");
      setChecks(
        data.settings.checks.map((check: any) => ({
          ...check,
          expectedText: JSON.stringify(check.expected),
        })),
      );
      setEditing(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load checks.");
    } finally {
      setBusy(false);
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    let values;
    try {
      values = checks.map((check) => ({
        id: check.id,
        title: check.title,
        instructions: check.instructions,
        buttonLabel: check.buttonLabel,
        query: check.query,
        operator: check.operator,
        expected:
          check.operator === "equals" ? JSON.parse(check.expectedText) : null,
      }));
    } catch {
      setError(
        'Use a JSON value for the expectation, such as 1, true or "{{marker}}".',
      );
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(id ? { id } : {}),
          origin,
          connectionString: url,
          checks: values,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || "Could not save the database connection.",
        );
      setConnections((previous) => [
        data.connection,
        ...previous.filter(
          (connection) => connection.id !== data.connection.id,
        ),
      ]);
      setUrl("");
      setEditing(false);
      setNotice(
        data.connection.check_count
          ? "Connection and read-only queries checked. Database verification is available for this origin when you start a swarm."
          : "Database connected. Automatic verification is ready for your next run.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save the connection.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function disconnect(connection: number) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: connection }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not disconnect.");
      setConnections((previous) => previous.filter((c) => c.id !== connection));
      setRemove(null);
      setNotice("Database disconnected. Existing reports remain available.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disconnect.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="mt-4 rounded-lg border border-line bg-surface px-5 py-2 sm:px-6"
      id="database-settings"
      open={expanded || autoOpen || undefined}
    >
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
        Database verification{" "}
        <span className="ml-2 font-normal text-muted">
          {connections.length
            ? `${connections.length} connected origin${connections.length === 1 ? "" : "s"}`
            : "Optional"}
        </span>
      </summary>
      <div className="pb-4 pt-3">
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          Choose a database from Supabase or Neon, or paste a connection URL.
          Agents automatically verify uniquely marked test records after app
          actions. Cleanup requires your approval in the run report. Advanced
          checks are optional.
        </p>
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-500/40 p-3 text-sm"
          >
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mt-4 text-sm text-muted">
            {notice}
          </p>
        )}
        {!!connections.length && (
          <ul className="mt-5 divide-y divide-line">
            {connections.map((connection) => (
              <li
                key={connection.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div className="min-w-0">
                  <p className="break-all text-sm font-medium">
                    {connection.origin}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {connection.check_count
                      ? `${connection.check_count} check${connection.check_count === 1 ? "" : "s"}`
                      : "Automatic verification ready"}{" "}
                    · Connection details hidden
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void reconnect(connection)}
                    className="min-h-11 px-2 text-sm font-medium text-primary"
                  >
                    Reconnect
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void edit(connection.id)}
                    className="min-h-11 px-2 text-sm font-medium text-primary"
                  >
                    Advanced checks
                  </button>
                  {remove === connection.id ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setRemove(null)}
                        className="min-h-11 px-2 text-sm"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void disconnect(connection.id)}
                        className="min-h-11 px-2 text-sm text-red-700 dark:text-red-300"
                      >
                        Confirm disconnect
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setRemove(connection.id)}
                      className="min-h-11 px-2 text-sm text-muted"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {!editing ? (
          <button
            type="button"
            disabled={!ready || busy}
            onClick={newConnection}
            className="mt-4 min-h-11 rounded-full border border-line px-4 text-sm font-medium"
          >
            Connect database
          </button>
        ) : (
          <div className="mt-6 border-t border-line pt-6">
            <label className="block max-w-lg text-sm font-medium">
              App origin
              <input
                required
                type="url"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                readOnly={!!id}
                placeholder="https://staging.example.com"
                className={field}
              />
            </label>
            {!id && (
              <DatabaseProviderPicker
                projectId={projectId}
                origin={origin}
                initialProvider={initialProvider}
                onConnected={(connection) => {
                  setError("");
                  setConnections((previous) => [
                    connection,
                    ...previous.filter((c) => c.id !== connection.id),
                  ]);
                  setEditing(false);
                  setUrl("");
                  setNotice(
                    connection.check_count
                      ? "Database connected. Your verification checks are ready."
                      : "Database connected. Automatic verification is ready for your next run.",
                  );
                }}
              />
            )}
            <details className="mt-5" open={!!id || undefined}>
              <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
                {id
                  ? "Connection and advanced checks"
                  : "Paste a connection URL instead"}
              </summary>
              <form
                method="post"
                action={endpoint}
                onSubmit={save}
                className="mt-6 border-t border-line pt-6"
              >
                <fieldset
                  disabled={!ready || busy}
                  className="space-y-6 disabled:opacity-60"
                >
                  <div className="grid gap-5 sm:grid-cols-2">
                    <label className="text-sm font-medium">
                      Read-only PostgreSQL URL
                      <input
                        required={!id}
                        type="password"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        autoComplete="new-password"
                        placeholder={
                          id
                            ? "Leave blank to keep the saved URL"
                            : "postgresql://user:password@host/database"
                        }
                        className={`${field} font-mono text-xs`}
                      />
                    </label>
                  </div>
                  <p className="text-xs leading-relaxed text-muted">
                    Use Neon, Supabase or another publicly reachable PostgreSQL
                    host with TLS. The app performs the action; PreFlight only
                    reads the result. Keep this connection scoped to test data
                    for the selected origin.
                  </p>
                  <div className="space-y-5">
                    {!checks.length && (
                      <p className="text-sm text-muted">
                        No checks yet. Connect now, then add checks to verify
                        specific button actions.
                      </p>
                    )}
                    {checks.map((check, index) => (
                      <section
                        key={index}
                        className="rounded-lg border border-line bg-page p-4 sm:p-5"
                        aria-labelledby={`db-check-${index}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <h3
                            id={`db-check-${index}`}
                            className="text-sm font-semibold"
                          >
                            Check {index + 1}
                          </h3>
                          {checks.length > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setChecks((previous) =>
                                  previous.filter((_, i) => i !== index),
                                )
                              }
                              aria-label={`Remove check ${index + 1}`}
                              className="min-h-11 px-2 text-xs text-muted"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <div className="mt-3 grid gap-4 sm:grid-cols-2">
                          <label className="text-sm">
                            Check name
                            <input
                              required
                              maxLength={100}
                              value={check.title}
                              onChange={(e) =>
                                update(index, { title: e.target.value })
                              }
                              placeholder="New task is saved"
                              className={field}
                            />
                          </label>
                          <label className="text-sm">
                            Exact button label
                            <input
                              required
                              maxLength={100}
                              value={check.buttonLabel}
                              onChange={(e) =>
                                update(index, { buttonLabel: e.target.value })
                              }
                              placeholder="Create task"
                              className={field}
                            />
                          </label>
                        </div>
                        <label className="mt-4 block text-sm">
                          Browser workflow
                          <textarea
                            required
                            rows={3}
                            maxLength={1500}
                            value={check.instructions}
                            onChange={(e) =>
                              update(index, { instructions: e.target.value })
                            }
                            placeholder="Open /tasks, create a task titled {{marker}}, then click Create task."
                            className={field}
                          />
                        </label>
                        <p className="mt-2 text-xs leading-relaxed text-muted">
                          Use <code>{"{{marker}}"}</code> for a unique value per
                          run. The workflow must activate the configured button.
                        </p>
                        <label className="mt-4 block text-sm">
                          Read-only SQL
                          <textarea
                            required
                            rows={3}
                            maxLength={4000}
                            spellCheck={false}
                            value={check.query}
                            onChange={(e) =>
                              update(index, { query: e.target.value })
                            }
                            placeholder="SELECT count(*) AS value FROM tasks WHERE title = $1"
                            className={`${field} font-mono text-xs`}
                          />
                        </label>
                        <p className="mt-2 text-xs text-muted">
                          Return one row and one scalar value. <code>$1</code>{" "}
                          receives the run’s unique marker. Queries and database
                          values are kept out of the model’s input.
                        </p>
                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                          <label className="text-sm">
                            After clicking, the value
                            <select
                              value={check.operator}
                              onChange={(e) =>
                                update(index, {
                                  operator: e.target
                                    .value as DraftCheck["operator"],
                                })
                              }
                              className={field}
                            >
                              <option value="equals">
                                Equals an expected value
                              </option>
                              <option value="changes">Changes</option>
                              <option value="increases">Increases</option>
                              <option value="decreases">Decreases</option>
                            </select>
                          </label>
                          {check.operator === "equals" && (
                            <label className="text-sm">
                              Expected JSON value
                              <input
                                required
                                value={check.expectedText}
                                onChange={(e) =>
                                  update(index, {
                                    expectedText: e.target.value,
                                  })
                                }
                                placeholder={'1, true or "{{marker}}"'}
                                className={`${field} font-mono text-xs`}
                              />
                            </label>
                          )}
                        </div>
                      </section>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={checks.length >= 10}
                    onClick={() =>
                      setChecks((previous) => [...previous, blankCheck()])
                    }
                    className="min-h-11 rounded-full border border-line px-4 text-sm disabled:opacity-50"
                  >
                    Add check
                  </button>
                  <div className="flex flex-wrap justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(false);
                        setUrl("");
                      }}
                      className="min-h-11 rounded-full border border-line px-4 text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn-primary min-h-11 px-5 text-sm font-medium"
                    >
                      {busy
                        ? "Checking connection…"
                        : checks.length
                          ? "Test and save"
                          : id
                            ? "Save connection"
                            : "Connect database"}
                    </button>
                  </div>
                </fieldset>
              </form>
            </details>
            {!id && (
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setUrl("");
                }}
                className="mt-4 min-h-11 text-sm text-muted"
              >
                Cancel setup
              </button>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
