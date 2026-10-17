"use client";

import { useEffect, useState } from "react";

type InviteStatus = {
  canInvite: boolean;
  remaining: number;
  max: number;
  code: string | null;
  link: string | null;
};

export default function InviteCard() {
  const [status, setStatus] = useState<InviteStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/invites")
      .then(async (res) => {
        if (!cancelled && res.ok) {
          setStatus((await res.json()) as InviteStatus);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Referred members cannot invite; nothing to show them.
  if (!status || !status.canInvite) return null;

  const reveal = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/invites", { method: "POST" });
      if (res.ok) {
        setStatus((await res.json()) as InviteStatus);
      }
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!status.link) return;
    try {
      await navigator.clipboard.writeText(status.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable; the link is still visible to copy manually.
    }
  };

  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-mist bg-lavender/50 px-6 py-5 dark:border-white/10 dark:bg-white/5">
      <div className="min-w-0">
        <p className="font-display text-base font-bold tracking-tight text-ink dark:text-white">
          Invite to PreFlight
        </p>
        <p className="mt-1 text-sm text-ink/60 dark:text-white/60">
          {status.remaining} out of {status.max} invites remaining.
        </p>
        {status.link && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="min-w-0 break-all rounded-lg border border-mist bg-white px-3 py-2 text-xs text-ink/70 dark:border-white/10 dark:bg-black/40 dark:text-white/70">
              {status.link}
            </code>
            <button
              type="button"
              onClick={() => void copy()}
              className="pressable shrink-0 cursor-pointer rounded-full border border-mist bg-white px-4 py-2 text-xs font-medium text-ink transition-colors duration-150 hover:bg-lavender dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
      </div>
      {!status.link && (
        <button
          type="button"
          onClick={() => void reveal()}
          disabled={busy || status.remaining === 0}
          className="pressable btn-gradient shrink-0 cursor-pointer rounded-full px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Creating…" : "Get invite link"}
        </button>
      )}
    </div>
  );
}
