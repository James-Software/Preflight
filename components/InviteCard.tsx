"use client";

import { useEffect, useState } from "react";
import CopyButton from "./CopyButton";

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

  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border px-6 py-5 border-line bg-panel">
      <div className="min-w-0">
        <p className="font-display text-base font-bold tracking-tight text-ink dark:text-white">
          Invite to PreFlight
        </p>
        <p className="mt-1 text-sm text-ink/60 dark:text-white/60">
          {status.remaining} out of {status.max} invites remaining.
        </p>
        {status.link && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="min-w-0 break-all rounded-lg border bg-white px-3 py-2 text-xs text-ink/70 dark:bg-black/40 dark:text-white/70 border-line">
              {status.link}
            </code>
            <CopyButton text={status.link} label="Copy invite link" />
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
