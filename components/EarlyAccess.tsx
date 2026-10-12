"use client";

import { useState } from "react";
import { PixelSprite, CHECK_MAP } from "./pixel-art";

const CHECK_PALETTE: Record<string, string> = { "#": "#4338CA" };

export default function EarlyAccess() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setError("");
    setSending(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Request failed");
      setDone(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section id="early-access" className="bg-white py-24 md:py-32">
      <div className="mx-auto max-w-xl px-6 text-center">
        <p className="text-xs font-semibold tracking-[0.22em] text-primary">
          EARLY ACCESS
        </p>
        <h2 className="font-display mt-4 text-3xl font-bold tracking-tight text-ink md:text-4xl">
          Be first in line for takeoff.
        </h2>
        <p className="mt-4 text-base leading-relaxed text-ink/60">
          Preflight is in final approach. Leave your email and we will notify
          you at launch.
        </p>

        {done ? (
          <div className="mx-auto mt-8 flex max-w-md items-center justify-center gap-3 rounded-2xl border border-mist bg-lavender px-6 py-5">
            <PixelSprite map={CHECK_MAP} palette={CHECK_PALETTE} pixel={4} />
            <p className="text-sm font-medium text-ink">
              You are on the manifest. We will email you at launch.
            </p>
          </div>
        ) : (
          <form
            onSubmit={submit}
            className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row"
            noValidate
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              aria-label="Email address"
              disabled={sending}
              className="flex-1 rounded-xl border border-mist bg-white px-4 py-3 text-sm text-ink placeholder:text-ink/35 focus:border-primary focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={sending}
              className="pressable btn-gradient cursor-pointer rounded-full px-6 py-3 text-sm font-medium text-white disabled:cursor-wait disabled:opacity-70"
            >
              {sending ? "Joining…" : "Notify me"}
            </button>
          </form>
        )}
        {error && !done && (
          <p className="mt-3 text-sm font-medium text-red-600">{error}</p>
        )}
      </div>
    </section>
  );
}
