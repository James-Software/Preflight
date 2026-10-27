"use client";
import { useEffect, useState } from "react";
import type { Collaborator, PendingProjectInvite } from "@/lib/project-collaboration";
export default function ProjectCollaborators({ projectId, ownerLogin, initial }: {
  projectId: number; ownerLogin: string;
  initial: { owner: boolean; members: Collaborator[]; invitations: PendingProjectInvite[] };
}) {
  const [data, setData] = useState(initial), [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  useEffect(() => {
    if (busy) return;
    const controller = new AbortController();
    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch(`/api/projects/${projectId}/collaborators`, { signal: controller.signal, cache: "no-store" });
        if (response.ok) {
          const result = await response.json();
          if (!controller.signal.aborted) setData(result);
        }
      } catch { /* Keep the current list when a background refresh is unavailable. */ }
    }, 10000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [projectId, busy]);
  async function change(method: string, body: object, success: string) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/projects/${projectId}/collaborators`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result) throw new Error(result?.error || "Could not update collaborators. Try again.");
      setData(result); setMessage(success);
      if (method === "POST") setEmail("");
    } catch (e) { setError(e instanceof Error ? e.message : "Try again shortly."); }
    finally { setBusy(false); }
  }
  return <div className="mt-7 max-w-3xl">
    {data.owner && <form method="post" action={`/api/projects/${projectId}/collaborators`} onSubmit={(e) => { e.preventDefault(); void change("POST", { email }, "Invitation sent. The recipient has seven days to join."); }}>
      <fieldset disabled={busy} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1"><label htmlFor="collaborator-email" className="mb-2 block text-sm font-medium">Invite by email</label>
          <input id="collaborator-email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="teammate@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className="min-h-11 w-full rounded-lg border border-line bg-page px-3 text-sm" /></div>
        <button type="submit" className="pressable btn-primary min-h-11 rounded-lg px-5 text-sm font-medium text-white disabled:opacity-50">{busy ? "Updating…" : "Send invitation"}</button>
      </fieldset>
    </form>}
    {error && <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
    {message && <p role="status" className="mt-4 text-sm text-muted">{message}</p>}
    <section className="mt-9" aria-labelledby="project-people"><h2 id="project-people" className="text-lg font-semibold">People</h2>
      <ul className="mt-3 divide-y divide-line">
        <li className="flex min-h-20 items-center justify-between gap-3 py-4"><span className="text-sm font-medium">@{ownerLogin}</span><span className="text-xs text-muted">Owner</span></li>
        {data.members.map((member) => <li key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="min-w-0"><p className="break-words text-sm font-medium">@{member.github_login}</p><p className="mt-1 break-all text-xs text-muted">{member.email}</p></div>
          <div className="flex items-center gap-3"><span className="text-xs text-muted">Member</span>{data.owner && <button type="button" disabled={busy} aria-label={`Remove ${member.github_login}`} onClick={() => void change("DELETE", { userId: member.user_id }, "Collaborator removed.")} className="pressable min-h-11 cursor-pointer rounded-lg px-3 text-sm text-muted transition-colors hover:bg-panel hover:text-red-500 disabled:opacity-50">Remove</button>}</div>
        </li>)}
      </ul>
    </section>
    {data.owner && data.invitations.length > 0 && <section className="mt-8" aria-labelledby="pending-project-invites"><h2 id="pending-project-invites" className="text-lg font-semibold">Pending invitations</h2>
      <ul className="mt-3 divide-y divide-line">{data.invitations.map((invite) => <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="min-w-0"><p className="break-all text-sm font-medium">{invite.email}</p><p className="mt-1 text-xs text-muted">{invite.status === "expired" ? "Expired" : invite.delivery === "failed" ? "Email was not sent" : invite.delivery === "sending" ? "Sending…" : "Awaiting acceptance"}</p></div>
        <div className="flex gap-1"><button disabled={busy} type="button" onClick={() => void change("POST", { email: invite.email }, "A new invitation was sent. The previous link no longer works.")} className="pressable min-h-11 cursor-pointer rounded-lg px-3 text-sm text-muted transition-colors hover:bg-panel hover:text-primary disabled:opacity-50">Resend</button>
          <button disabled={busy} type="button" onClick={() => void change("DELETE", { inviteId: invite.id }, "Invitation revoked.")} className="pressable min-h-11 cursor-pointer rounded-lg px-3 text-sm text-muted transition-colors hover:bg-panel hover:text-red-500 disabled:opacity-50">Revoke</button></div>
      </li>)}</ul>
    </section>}
  </div>;
}
