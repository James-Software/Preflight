"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export default function AcceptProjectInvite({ token, login, email }: { token: string; login: string; email: string }) {
  const router = useRouter();
  const [code, setCode] = useState(""), [needsCode, setNeedsCode] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function join(resend = false) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/project-invites/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(needsCode && !resend ? { code } : {}) });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result) throw new Error(result?.error || "Could not join this project. Try again.");
      if (result.projectId) { router.push(`/dashboard/projects/${result.projectId}`); router.refresh(); }
      else if (result.requiresCode) {
        if (result.codeAlreadySent && needsCode) setError("Use the code already sent, or wait a minute to request another.");
        setNeedsCode(true); setCode("");
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Try again shortly."); }
    finally { setBusy(false); }
  }
  return <form method="post" action={`/api/project-invites/${token}`} onSubmit={(e) => { e.preventDefault(); void join(); }} className="mt-7">
    <p className="text-sm text-muted">Joining as <span className="font-medium text-ink dark:text-white">@{login}</span></p>
    {needsCode && <div className="mt-5"><label htmlFor="invite-code" className="block text-sm font-medium">Code sent to {email}</label>
      <p className="mt-2 text-xs leading-relaxed text-muted">GitHub couldn’t verify this address. Confirm it with the six-digit email code.</p>
      <input id="invite-code" name="code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus className="mt-3 min-h-12 w-full rounded-lg border border-line bg-page px-4 text-center text-lg tracking-[0.4em]" />
    </div>}
    {error && <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
    <button type="submit" disabled={busy} className="pressable btn-primary mt-5 min-h-11 w-full rounded-lg px-5 text-sm font-medium text-white disabled:opacity-50">{busy ? "Joining…" : needsCode ? "Confirm and join" : "Join project"}</button>
    {needsCode && <button type="button" disabled={busy} onClick={() => void join(true)} className="pressable mt-2 min-h-11 w-full cursor-pointer rounded-lg text-sm text-muted transition-colors hover:bg-panel hover:text-primary">Send another code</button>}
  </form>;
}
