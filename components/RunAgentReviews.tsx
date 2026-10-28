import type { AgentRunReview } from "@/lib/run-agent-tools";
export default function RunAgentReviews({ reviews }: { reviews: AgentRunReview[] }) {
  if (!reviews.length) return null;
  const labels: Record<string, string> = { supported: "Supported by evidence", not_supported: "Not supported", inconclusive: "Inconclusive", safe_to_cleanup: "Eligible at inspection", unsafe_to_cleanup: "Cleanup not supported" };
  return <section className="mt-8" aria-labelledby="agent-assessments"><h2 id="agent-assessments" className="text-xl font-semibold">Agent assessments</h2>
    <p className="mt-2 text-sm leading-relaxed text-muted">External agent reviews are saved with their evidence. Original test results and cleanup decisions stay separate.</p>
    <ul className="mt-4 divide-y divide-line">{reviews.map((r) => <li key={r.id} className="py-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="break-words text-sm font-medium">{r.target_title}</h3><span className="text-xs text-muted">{labels[r.outcome] || "Inconclusive"}</span></div>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted">{r.summary}</p>
      {!!r.citations.length && <ul className="mt-2 text-xs text-muted">{r.citations.map((c, i) => <li className="break-all" key={i}><code>{c.path}:{c.start}–{c.end}<span className="whitespace-nowrap"> · {c.sha.slice(0, 7)}</span></code></li>)}</ul>}
      <p className="mt-2 text-xs text-muted">Agent via @{r.actor_login} · {r.basis.replaceAll("_", " ")}</p>
    </li>)}</ul>
  </section>;
}
