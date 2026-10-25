"use client";
import { useEffect, useState } from "react";
import type { AuthProfile } from "@/lib/auth-profiles";

type Capture = { id: string; liveUrl: string; expiresAt: number };
export default function BrowserProfileSetup({
  initialOrigin,
  onSaved,
  projectId,
}: {
  initialOrigin: string;
  onSaved: (profile: AuthProfile) => void;
  projectId: number;
}) {
  const endpoint = `/api/profiles/browser?projectId=${projectId}`;
  const [capture, setCapture] = useState<Capture | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    let mounted = true;
    void fetch(endpoint, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (mounted && data.capture) setCapture(data.capture);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setReady(true);
      });
    return () => {
      mounted = false;
    };
  }, [endpoint]);
  useEffect(() => {
    setExpired(false);
    if (!capture) return;
    const timer = setTimeout(
      () => setExpired(true),
      Math.max(0, capture.expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [capture]);
  async function request(method: string, input: object) {
    const response = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Could not complete browser sign-in.");
    return data;
  }
  async function start(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError("");
    try {
      setCapture(await request("POST", input));
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Connection lost. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function finish(cancel: boolean) {
    if (!capture) return;
    setBusy(true);
    setError("");
    try {
      if (expired) {
        setCapture(null);
        return;
      }
      const data = await request(cancel ? "DELETE" : "PATCH", {
        id: capture.id,
      });
      setCapture(null);
      if (data.profile) onSaved(data.profile);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Connection lost. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  const field =
    "mt-2 min-h-11 w-full rounded-lg border border-line bg-page px-3 py-2 text-sm";
  return (
    <section
      className="mt-6 rounded-xl border border-line bg-surface p-5 sm:p-7"
      aria-labelledby="browser-profile-title"
    >
      <h2 id="browser-profile-title" className="text-lg font-semibold">
        Sign in with browser
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Sign in to your app with a test account. We’ll save the session for your
        agents—no copying cookies.
      </p>
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {!capture ? (
        <form method="post" action={endpoint} onSubmit={start}>
          <fieldset
            disabled={!ready || busy}
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
                  className={field}
                />
              </label>
              <label className="text-sm font-medium">
                App URL
                <input
                  name="origin"
                  type="url"
                  required
                  defaultValue={initialOrigin}
                  placeholder="https://staging.example.com"
                  className={field}
                />
              </label>
              <div>
                <label className="text-sm font-medium">
                  Protected page
                  <input
                    name="verificationPath"
                    required
                    placeholder="/dashboard"
                    className={field}
                    aria-describedby="protected-page-help"
                  />
                </label>
                <span
                  id="protected-page-help"
                  className="mt-2 block text-xs font-normal text-muted"
                >
                  A page that requires signing in.
                </span>
              </div>
              <div>
                <label className="text-sm font-medium">
                  Text visible after sign-in
                  <input
                    name="verificationText"
                    required
                    maxLength={200}
                    placeholder="Your workspace"
                    className={field}
                    aria-describedby="signed-in-text-help"
                  />
                </label>
                <span
                  id="signed-in-text-help"
                  className="mt-2 block text-xs font-normal text-muted"
                >
                  Text shown on that page only when signed in.
                </span>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted">
              A private cloud browser opens for 10 minutes. Session recording is
              disabled. Sign in yourself, including any two-factor prompts; your
              password isn’t sent to an AI model. A database connection isn’t
              required.
            </p>
            <button
              type="submit"
              className="btn-primary min-h-11 px-5 text-sm font-medium"
            >
              {busy ? "Opening browser…" : "Open sign-in browser"}
            </button>
          </fieldset>
        </form>
      ) : (
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p role="status" className="text-sm text-muted">
              {expired
                ? "Browser session expired. Start again to continue."
                : busy
                  ? "Checking your session…"
                  : "Sign in below, then choose Verify and save."}
            </p>
            {!expired && (
              <a
                href={capture.liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="pressable inline-flex min-h-11 items-center text-sm font-medium text-primary"
              >
                Open in new tab ↗
              </a>
            )}
          </div>
          {!expired && (
            <iframe
              title="Private sign-in browser"
              src={capture.liveUrl}
              referrerPolicy="no-referrer"
              allow="clipboard-write"
              className="mt-3 h-[65svh] min-h-80 w-full rounded-lg border border-line bg-black"
            />
          )}
          <p className="mt-3 text-xs leading-relaxed text-muted">
            We check the saved session in a fresh browser before creating the
            profile. Only this app’s cookies and local storage are kept,
            encrypted; other sites’ sessions are discarded.
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void finish(true)}
              className="min-h-11 rounded-full border border-line px-4 text-sm disabled:opacity-60"
            >
              {expired ? "Start again" : "Cancel"}
            </button>
            {!expired && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void finish(false)}
                className="btn-primary min-h-11 px-5 text-sm font-medium disabled:opacity-60"
              >
                {busy ? "Verifying…" : "Verify and save profile"}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
