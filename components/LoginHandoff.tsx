"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";

export default function LoginHandoff({ returnTo }: { returnTo: string }) {
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const started = useRef(false);
  const begin = useCallback(() => {
    setBusy(true);
    setError("");
    void signIn("github", { redirectTo: returnTo }).catch(() => {
      setBusy(false);
      setError("We couldn’t open GitHub. Please try again.");
    });
  }, [returnTo]);
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      begin();
    }
  }, [begin]);
  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => {
      setBusy(false);
      setError("GitHub is taking longer than expected. You can try again.");
    }, 10000);
    return () => clearTimeout(timer);
  }, [busy]);
  return (
    <main className="flex min-h-svh items-center justify-center bg-page px-6 pb-16 pt-28">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          Sign in to PreFlight
        </h1>
        <p role="status" className="mt-4 leading-relaxed text-muted">
          {busy
            ? "Opening GitHub to continue securely…"
            : "Use your GitHub account to continue."}
        </p>
        {error && (
          <p
            role="alert"
            className="mt-4 text-sm text-red-700 dark:text-red-300"
          >
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={begin}
          className="pressable btn-gradient mt-6 min-h-11 rounded-full px-6 py-3 text-sm font-medium text-white disabled:cursor-wait disabled:opacity-75"
        >
          {busy ? "Connecting…" : "Try GitHub again"}
        </button>
        <a
          href="/"
          className="mt-4 flex min-h-11 items-center justify-center text-sm font-medium text-muted hover:text-primary"
        >
          Back to home
        </a>
        <noscript>
          <p className="mt-4">Enable JavaScript to sign in with GitHub.</p>
        </noscript>
      </div>
    </main>
  );
}
