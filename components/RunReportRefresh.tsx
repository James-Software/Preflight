"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function RunReportRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [active, router]);
  return (
    <div className="flex flex-wrap items-center gap-4">
      {active && (
        <p role="status" className="text-sm text-muted">
          This report updates while agents work.
        </p>
      )}
      <button
        type="button"
        onClick={() => startTransition(() => router.refresh())}
        disabled={pending}
        className="min-h-11 rounded-full border border-line px-4 text-sm font-medium disabled:opacity-60"
      >
        {pending ? "Updating…" : "Refresh report"}
      </button>
    </div>
  );
}
