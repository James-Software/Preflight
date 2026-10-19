"use client";

import { useEffect } from "react";
import { signIn } from "next-auth/react";

export default function Login() {
  useEffect(() => {
    signIn("github", { callbackUrl: "/dashboard" });
  }, []);

  return (
    <main className="flex min-h-svh items-center justify-center pb-16 pt-28 bg-page">
      <p className="text-sm text-ink/60 dark:text-white/60">Redirecting to GitHub&hellip;</p>
    </main>
  );
}
