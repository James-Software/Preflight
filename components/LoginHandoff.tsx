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
    <main className="flex min-h-svh items-center justify-center bg-black px-6 text-white">
      <p role="status" className="text-base">
        Connecting to Github...
      </p>
    </main>
  );
}
