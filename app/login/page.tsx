"use client";

import { useEffect } from "react";
import { signIn } from "next-auth/react";

export default function Login() {
  useEffect(() => {
    signIn("github", { callbackUrl: "/dashboard" });
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-white">
      <p className="text-sm text-ink/60">Redirecting to GitHub&hellip;</p>
    </main>
  );
}
