"use client";
import { useState } from "react";

export default function CopyRunDetails({ details }: { details: string }) {
  const [copied, setCopied] = useState(false),
    [fallback, setFallback] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(details);
      setCopied(true);
      setFallback(false);
    } catch {
      setFallback(true);
    }
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => void copy()}
        className="pressable inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line px-4 text-sm font-medium hover:bg-panel"
      >
        {copied ? "Copied run details" : "Copy run details"}
      </button>
      {fallback && (
        <label className="mt-3 block text-sm text-muted">
          Select and copy run details
          <textarea
            readOnly
            value={details}
            onFocus={(event) => event.currentTarget.select()}
            className="mt-2 block h-40 w-full rounded-lg border border-line bg-page p-3 font-mono text-xs"
          />
        </label>
      )}
    </div>
  );
}
