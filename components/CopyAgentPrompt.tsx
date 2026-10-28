"use client";
import { useEffect, useRef, useState } from "react";
import IconSwap from "@/components/IconSwap";
import { useRouter } from "next/navigation";
export default function CopyAgentPrompt({ projectId, runId }: { projectId: number; runId: number }) {
  const router = useRouter();
  const endpoint = `/api/projects/${projectId}/runs/${runId}/agent-access`;
  const [copied, setCopied] = useState(false), [busy, setBusy] = useState(false), [active, setActive] = useState(false);
  const [error, setError] = useState(""), [fallback, setFallback] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), mounted = useRef(true);
  const operation = useRef(0);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    mounted.current = true;
    const id = ++operation.current;
    const controller = new AbortController();
    void fetch(endpoint, { signal: controller.signal, cache: "no-store" }).then(async (r) => {
      if (r.ok) { const data = await r.json(); if (mounted.current && operation.current === id && !controller.signal.aborted) setActive(data.active === true); }
    }).catch(() => {});
    return () => { mounted.current = false; operation.current++; controller.abort(); if (timer.current) clearTimeout(timer.current); };
  }, [endpoint]);
  useEffect(() => {
    if (!active) return;
    let lastRefresh = 0;
    const refresh = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRefresh > 1000) {
        lastRefresh = Date.now(); router.refresh();
      }
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [active, router]);
  async function copy() {
    const id = ++operation.current;
    const current = () => mounted.current && operation.current === id;
    setBusy(true); setError(""); setCopied(false); setFallback("");
    if (timer.current) clearTimeout(timer.current);
    const prompt = fetch(endpoint, { method: "POST" }).then(async (r) => {
      const data = await r.json().catch(() => null);
      if (!r.ok || typeof data?.prompt !== "string") throw new Error(data?.error || "Could not prepare the agent prompt.");
      if (current()) setActive(true);
      return data.prompt as string;
    });
    try {
      try {
        // Start the clipboard operation in the click task, before network awaits (Safari).
        if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
          const blob = prompt.then((text) => new Blob([text], { type: "text/plain" }));
          // Clipboard permission can fail before the browser consumes this promise.
          // Mark it handled without turning a failed grant into clipboard success.
          void blob.catch(() => {});
          await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
        } else await navigator.clipboard.writeText(await prompt);
        if (current()) { setCopied(true); timer.current = setTimeout(() => { if (current()) setCopied(false); }, 2200); }
      } catch {
        const text = await prompt;
        if (current()) setFallback(text);
      }
    } catch (e) { if (current()) setError(e instanceof Error ? e.message : "Could not prepare the agent prompt."); }
    finally { if (current()) setBusy(false); }
  }
  async function revoke() {
    setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not revoke agent access. Try again.");
      setActive(false); setCopied(false); setFallback(""); button.current?.focus();
    } catch (e) { setError(e instanceof Error ? e.message : "Try again."); }
    finally { setBusy(false); }
  }
  return <div className="relative min-w-0">
    <div className="flex flex-wrap items-center gap-1">
      <button ref={button} type="button" disabled={busy} aria-busy={busy} onClick={() => void copy()} className="pressable inline-flex min-h-11 w-52 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border border-line px-4 text-sm font-medium transition-colors hover:bg-panel disabled:cursor-wait disabled:opacity-60">
        <IconSwap active={copied}
          idleIcon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4"><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4" /></svg>}
          activeIcon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4"><path d="m5 12 4 4L19 6" /></svg>} />
        {busy ? "Preparing…" : copied ? "Copied agent prompt" : "Copy agent prompt"}
      </button>
      {active && <details className="relative"><summary aria-label="Agent access options" className="pressable flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-full text-muted transition-colors hover:bg-panel"><span aria-hidden="true">···</span></summary>
        <div className="absolute right-0 z-20 mt-2 w-64 rounded-lg border border-line bg-page p-3 shadow-lg">
          <p className="text-xs leading-relaxed text-muted">Access is limited to this run and expires after 24 hours. Assessments are saved; Cleanup keeps its Accept/Deny controls.</p>
          <button type="button" disabled={busy} onClick={() => void revoke()} className="pressable mt-2 min-h-11 w-full cursor-pointer rounded-lg px-3 text-left text-sm transition-colors hover:bg-panel">Revoke agent access</button>
        </div>
      </details>}
    </div>
    <span role="status" className="sr-only">{copied ? "Agent prompt copied. Paste it into Codex to review this run." : ""}</span>
    {error && <p role="alert" className="mt-2 max-w-sm text-sm text-red-600 dark:text-red-400">{error}</p>}
    {fallback && <label className="mt-3 block max-w-xl text-sm text-muted">Select and copy the agent prompt
      <textarea readOnly value={fallback} onFocus={(e) => e.currentTarget.select()} className="mt-2 h-44 w-full rounded-lg border border-line bg-page p-3 font-mono text-xs" />
    </label>}
  </div>;
}
