import { PullRequestIcon } from "@/components/GitIcons";
import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { getProject, getRunReport } from "@/lib/schema";
import RunReportRefresh from "@/components/RunReportRefresh";

function webUrl(raw: string | null, githubOnly = false): string | undefined {
  if (!raw) return;
  try {
    const url = new URL(raw);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      (githubOnly && url.hostname !== "github.com")
    )
      return;
    return url.href;
  } catch {
    return;
  }
}
function networkText(value: unknown): string | null {
  if (value == null || value === "" || (Array.isArray(value) && !value.length))
    return null;
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export default async function RunReportPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}) {
  const { id, runId } = await params;
  const session = await auth();
  const owner = session?.user?.githubId;
  if (!owner)
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/dashboard/projects/${id}/runs/${runId}`)}`,
    );
  const projectId = Number(id),
    runNumber = Number(runId);
  if (
    !Number.isSafeInteger(projectId) ||
    projectId <= 0 ||
    !Number.isSafeInteger(runNumber) ||
    runNumber <= 0
  )
    notFound();
  const project = await getProject(projectId, owner);
  if (!project) notFound();
  const report = await getRunReport(projectId, runNumber, owner);
  if (!report) notFound();
  const { run, findings } = report;
  const active = ["queued", "planning", "planned", "running"].includes(
    run.status,
  );
  return (
    <main className="min-h-[calc(100svh-5rem)] bg-page">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <a
          href={`/dashboard/projects/${projectId}`}
          className="inline-flex min-h-11 items-center text-sm font-medium text-muted hover:text-primary"
        >
          ← All runs
        </a>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          Run #{run.id}
        </h1>
        <p className="mt-2 break-words text-muted">{project.repo_full_name}</p>
        <div className="mt-6 flex flex-wrap items-center gap-4 text-sm">
          <span className="rounded-full bg-panel px-3 py-1.5 capitalize">
            {run.status}
          </span>
          <span>
            {findings.length} finding{findings.length === 1 ? "" : "s"}
          </span>
          <time className="text-muted" dateTime={run.created_at}>
            {new Date(run.created_at).toLocaleString("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </time>
        </div>
        {run.target_url && (
          <p className="mt-4 break-all text-sm text-muted">
            Tested URL: {run.target_url}
          </p>
        )}
        <div className="mt-6">
          <RunReportRefresh active={active} />
        </div>
        {!findings.length ? (
          <div className="mt-10 rounded-2xl bg-panel p-8">
            <h2 className="text-xl font-semibold">
              {active
                ? "Agents are collecting evidence."
                : "No findings recorded."}
            </h2>
            <p className="mt-3 text-muted">
              {active
                ? "Findings will appear here as they are saved."
                : run.status === "completed"
                  ? "This run finished without any recorded findings."
                  : "This run ended without recorded findings. You can start another run from the project."}
            </p>
          </div>
        ) : (
          <div className="mt-10 space-y-10">
            {findings.map((finding) => {
              const screenshot = webUrl(finding.screenshot_url);
              const pr = webUrl(finding.pr_url, true);
              const network = networkText(finding.network_errors);
              return (
                <article
                  key={finding.id}
                  className="min-w-0 rounded-2xl bg-surface p-5 sm:p-8"
                  aria-labelledby={`finding-${finding.id}`}
                >
                  <div className="mb-3 flex flex-wrap gap-3 text-sm capitalize text-muted">
                    <span>{finding.severity || "Unclassified"} severity</span>
                    <span>{finding.status}</span>
                  </div>
                  <h2
                    id={`finding-${finding.id}`}
                    className="break-words text-2xl font-semibold tracking-tight"
                  >
                    {finding.title}
                  </h2>
                  {finding.repro_steps && (
                    <section className="mt-6">
                      <h3 className="font-semibold">How to reproduce</h3>
                      <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed">
                        {finding.repro_steps}
                      </p>
                    </section>
                  )}
                  {screenshot && (
                    <figure className="mt-6">
                      <a
                        href={screenshot}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Open full screenshot for ${finding.title}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={screenshot}
                          alt={`Browser evidence for ${finding.title}`}
                          className="h-auto w-full rounded-xl"
                          loading="lazy"
                        />
                      </a>
                      <figcaption className="mt-2 text-sm text-muted">
                        Captured browser evidence · open for full size
                      </figcaption>
                    </figure>
                  )}
                  {finding.root_cause && (
                    <section className="mt-6">
                      <h3 className="font-semibold">Root cause</h3>
                      <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed">
                        {finding.root_cause}
                      </p>
                      {finding.confidence && (
                        <p className="mt-2 text-sm text-muted">
                          Confidence: {finding.confidence}
                        </p>
                      )}
                    </section>
                  )}
                  {finding.console_logs && (
                    <details className="mt-6">
                      <summary className="min-h-11 cursor-pointer py-2 font-medium">
                        Console logs
                      </summary>
                      <pre className="mt-2 max-h-96 overflow-auto rounded-xl bg-panel p-4 text-sm leading-relaxed">
                        <code>{finding.console_logs}</code>
                      </pre>
                    </details>
                  )}
                  {network && (
                    <details className="mt-3">
                      <summary className="min-h-11 cursor-pointer py-2 font-medium">
                        Network evidence
                      </summary>
                      <pre className="mt-2 max-h-96 overflow-auto rounded-xl bg-panel p-4 text-sm leading-relaxed">
                        <code>{network}</code>
                      </pre>
                    </details>
                  )}
                  {finding.patch_diff && (
                    <details className="mt-3">
                      <summary className="min-h-11 cursor-pointer py-2 font-medium">
                        Proposed code change
                      </summary>
                      <pre className="mt-2 max-h-96 overflow-auto rounded-xl bg-panel p-4 text-sm leading-relaxed">
                        <code>{finding.patch_diff}</code>
                      </pre>
                    </details>
                  )}
                  {pr && (
                    <a
                      href={pr}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-panel px-5 text-sm font-semibold text-primary"
                    >
                      <PullRequestIcon />
                      Review PR{" "}
                      {finding.pr_number
                        ? `#${finding.pr_number}`
                        : "on GitHub"}
                    </a>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
