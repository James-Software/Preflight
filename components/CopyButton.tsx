"use client";

import { useEffect, useRef, useState } from "react";
import IconSwap from "./IconSwap";

export default function CopyButton({ text, label = "Copy to clipboard" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef(0);

  useEffect(() => () => {
    request.current++;
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    const id = ++request.current;
    if (timer.current) clearTimeout(timer.current);
    setPending(true);
    setError(false);
    try {
      await navigator.clipboard.writeText(text);
      if (request.current !== id) return;
      setCopied(true);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      if (request.current !== id) return;
      setCopied(false);
      setError(true);
    } finally {
      if (request.current === id) setPending(false);
    }
  };

  return (
    <span className="inline-flex shrink-0 items-center">
      <button
        type="button"
        onClick={() => void copy()}
        disabled={pending}
        aria-busy={pending}
        aria-label={copied ? "Copied to clipboard" : label}
        title={error ? "Could not copy. Select the text to copy it manually." : copied ? "Copied!" : label}
        className="copy-button pressable flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line bg-surface text-ink hover:bg-panel disabled:cursor-wait dark:text-white"
      >
        <IconSwap
          active={copied}
          idleIcon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>}
          activeIcon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="m5 12 4 4L19 6" /></svg>}
        />
      </button>
      <span role="status" className="sr-only">{error ? "Could not copy. Select the text to copy it manually." : copied ? "Copied to clipboard" : ""}</span>
    </span>
  );
}
