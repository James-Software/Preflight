"use client";
import { useEffect, useRef, useState } from "react";
import type { AuthProfile } from "@/lib/auth-profiles";
import type { ProfileGeneration } from "@/lib/profile-generation";
import {
  readProfileSetupResponse,
  ProfileSetupResponseError,
  profileSetupErrorMessage,
} from "@/lib/profile-setup-response";

export default function AutomaticProfileSetup({
  projectId,
  initialOrigin,
  onSaved,
}: {
  projectId: number;
  initialOrigin: string;
  onSaved: (profile: AuthProfile) => void;
}) {
  const endpoint = `/api/profiles/generate?projectId=${projectId}`;
  const [generation, setGeneration] = useState<ProfileGeneration | null>(null);
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [statusAttempt, setStatusAttempt] = useState(0);
  const [statusFailed, setStatusFailed] = useState(false);
  const saved = useRef(onSaved);
  saved.current = onSaved;
  const delivered = useRef<string | null>(null);
  const active =
    !!generation &&
    ["queued", "running", "waiting"].includes(generation.status);
  useEffect(() => {
    const controller = new AbortController();
    let attempts = 0,
      timer: ReturnType<typeof setTimeout>;
    setReady(false);
    setError("");
    setStatusFailed(false);
    async function check() {
      try {
        const response = await fetch(endpoint, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await readProfileSetupResponse(response);
        if (controller.signal.aborted) return;
        setGeneration(data.generation);
        setError("");
        setReady(true);
      } catch (error) {
        if (controller.signal.aborted) return;
        attempts++;
        if (
          attempts < 3 &&
          (!(error instanceof ProfileSetupResponseError) || error.retryable)
        ) {
          timer = setTimeout(check, 1000 * attempts);
        } else {
          setError(profileSetupErrorMessage(error));
          setStatusFailed(true);
          setReady(true);
        }
      }
    }
    void check();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [endpoint, statusAttempt]);
  useEffect(() => {
    if (!generation || !active) return;
    const id = generation.id;
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      try {
        const response = await fetch(
          `${endpoint}&id=${encodeURIComponent(id)}`,
          { cache: "no-store", signal: controller.signal },
        );
        const data = await readProfileSetupResponse(response);
        if (stopped) return;
        if (!data.generation)
          throw new Error(
            "This setup is no longer available. Refresh to try again.",
          );
        setGeneration(data.generation);
        setError("");
        if (!["queued", "running", "waiting"].includes(data.generation.status))
          return;
      } catch (error) {
        if (!stopped) setError(profileSetupErrorMessage(error));
      }
      if (!stopped) timer = setTimeout(poll, 3000);
    }
    timer = setTimeout(poll, 2000);
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [endpoint, generation?.id, active]);
  useEffect(() => {
    if (
      generation?.status === "completed" &&
      generation.profile &&
      delivered.current !== generation.id
    ) {
      delivered.current = generation.id;
      saved.current(generation.profile);
    }
  }, [generation]);
  async function request(method: "POST" | "PATCH" | "DELETE", input: object) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await readProfileSetupResponse(response);
      setGeneration(data.generation);
      setStatusFailed(false);
    } catch (error) {
      // A timed-out POST can still have queued a job. Read its status rather
      // than resending a mutation that might create another test account.
      let recovered = false;
      if (!(error instanceof ProfileSetupResponseError) || error.retryable) {
        try {
          const id = method === "POST" ? undefined : generation?.id;
          const response = await fetch(
            `${endpoint}${id ? `&id=${encodeURIComponent(id)}` : ""}`,
            { cache: "no-store" },
          );
          const data = await readProfileSetupResponse(response);
          if (data.generation) {
            setGeneration(data.generation);
            const status = data.generation.status;
            recovered =
              method === "DELETE"
                ? status === "cancelled"
                : method === "PATCH"
                  ? ["queued", "running", "completed"].includes(status)
                  : !["cancelled", "expired", "error"].includes(status);
          }
        } catch {
          /* Keep the existing setup and the original useful error. */
        }
      }
      if (recovered) {
        setError("");
        setStatusFailed(false);
      } else setError(profileSetupErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="mt-6 rounded-xl border border-line bg-surface p-5 sm:p-7"
      aria-labelledby="automatic-profile-title"
    >
      <div className="flex items-center gap-3">
        <svg
          className="h-6 w-6 shrink-0 text-primary"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <rect x="4" y="7" width="16" height="13" rx="4" />
          <path d="M12 3v4M1 12v4m22-4v4M8 16h8" />
          <circle cx="8" cy="12" r="1" />
          <circle cx="16" cy="12" r="1" />
        </svg>
        <h2 id="automatic-profile-title" className="text-lg font-semibold">
          Generate a test profile
        </h2>
      </div>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
        PreFlight inspects your code and database, provisions a dedicated test
        user, and saves its real authentication tokens for this project.
      </p>
      {error && (
        <div className="mt-4">
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
          {statusFailed && (
            <button
              type="button"
              disabled={!ready || busy}
              onClick={() => setStatusAttempt((attempt) => attempt + 1)}
              className="mt-2 min-h-11 rounded-lg border border-line px-4 text-sm hover:bg-panel disabled:opacity-50"
            >
              Retry status
            </button>
          )}
        </div>
      )}
      {!active ? (
        <form
          method="post"
          action={endpoint}
          className="mt-5 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void request("POST", {
              origin: initialOrigin,
              email: new FormData(event.currentTarget).get("email"),
            });
          }}
        >
          {!initialOrigin && (
            <p className="text-sm text-muted">
              Set your app URL in General info first.
            </p>
          )}
          <details>
            <summary className="min-h-11 py-2 text-sm font-medium">
              Test email (optional)
            </summary>
            <label className="mt-2 block text-sm">
              Test email
              <input
                type="email"
                name="email"
                autoComplete="off"
                placeholder="qa@your-company.com"
                disabled={!ready || busy}
                className="mt-2 min-h-11 w-full max-w-md rounded-lg border border-line bg-page px-3 py-2 text-sm"
              />
            </label>
            <p className="mt-2 max-w-lg text-xs leading-relaxed text-muted">
              Leave blank to generate a unique test address. Your existing users
              are not modified.
            </p>
          </details>
          <p className="max-w-xl text-xs leading-relaxed text-muted">
            Connect this project’s database first. Supported authentication
            systems issue a test session automatically; this does not open an
            interactive browser. Saved PreFlight test accounts stay available
            until removed; their sessions renew automatically before runs.
          </p>
          <button
            type="submit"
            disabled={!ready || busy || !initialOrigin}
            className="btn-primary min-h-11 px-5 text-sm font-medium disabled:opacity-50"
            aria-busy={busy}
          >
            {!ready
              ? "Checking profiles…"
              : busy
                ? "Starting agent…"
                : "Generate profile"}
          </button>
        </form>
      ) : (
        <div className="mt-5">
          <p
            role="status"
            aria-live="polite"
            className="text-sm leading-relaxed text-muted"
          >
            {generation.message}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void request("DELETE", { id: generation.id })}
              className="min-h-11 rounded-lg border border-line px-4 text-sm hover:bg-panel disabled:opacity-50"
            >
              Cancel setup
            </button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Setup expires after 10 minutes. Cancelling stops setup; it does not
            delete an account already created in your app.
          </p>
        </div>
      )}
      {generation && !active && generation.status !== "completed" && (
        <p role="status" className="mt-4 text-sm text-muted">
          {generation.message}
        </p>
      )}
    </section>
  );
}
