"use client";

import { useEffect, useRef } from "react";
import { signIn } from "next-auth/react";

export default function LoginHandoff({ returnTo }: { returnTo: string }) {
  const startedFor = useRef<string | null>(null);
  const mounted = useRef(false);
  const attempts = useRef(0);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    mounted.current = true;
    const connect = async () => {
      try {
        await signIn("github", { redirectTo: returnTo });
      } catch {
        if (!mounted.current) return;
        if (++attempts.current >= 3) {
          window.location.replace("/access-denied?reason=github");
        } else {
          retry.current = setTimeout(
            () => void connect(),
            attempts.current * 1500,
          );
        }
      }
    };
    if (startedFor.current !== returnTo) {
      startedFor.current = returnTo;
      attempts.current = 0;
      void connect();
    }
    const timeout = setTimeout(() => {
      window.location.replace("/access-denied?reason=github");
    }, 30000);
    return () => {
      mounted.current = false;
      if (retry.current) clearTimeout(retry.current);
      clearTimeout(timeout);
    };
  }, [returnTo]);
  return (
    <main className="auth-handoff flex min-h-svh items-center justify-center bg-page px-6 text-ink dark:text-white">
      <div>
        <p className="mb-8 text-sm font-medium">PreFlight</p>
        <h1 className="text-4xl font-medium tracking-tight">One moment.</h1>
        <p role="status" className="mt-5 text-base text-muted">Connecting to GitHub…</p>
      </div>
    </main>
  );
}
