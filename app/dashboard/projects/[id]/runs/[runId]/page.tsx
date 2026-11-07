import { recoverLegacyVerification } from "@/lib/verification-recovery";
import DatabaseCheckResults from "@/components/DatabaseCheckResults";
import TestStepResults from "@/components/TestStepResults";
import RunArchiveButton from "@/components/RunArchiveButton";
import FixesTable from "@/components/FixesTable";
import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { getProject, getRunReport } from "@/lib/schema";
import RunReportRefresh from "@/components/RunReportRefresh";
import CopyRunDetails from "@/components/CopyRunDetails";
import CopyAgentPrompt from "@/components/CopyAgentPrompt";
import RunAgentReviews from "@/components/RunAgentReviews";
import { listAgentRunReviews } from "@/lib/run-agent-tools";
import { runDetails, runStatusLabel } from "@/lib/run-details";

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
  const project = await getProject(projectId, owner, "member");
  if (!project) notFound();
  const report = await getRunReport(projectId, runNumber, owner);
  if (!report) notFound();
  const { run, findings } = report;
  const canConnectAgent = !session?.user?.isTestUser && !owner.startsWith("test:");
  const agentReviews = canConnectAgent ? await listAgentRunReviews(projectId, runNumber, owner) : [];
  const recoveryQueued = canConnectAgent && await recoverLegacyVerification(run, report.testResults || []);
  const details = runDetails(report);
  const active = recoveryQueued || ["queued", "planning", "planned", "running"].includes(
    run.status,
  );
  return (
    <main className="min-h-[calc(100svh-5rem)] bg-page">
      <div className="max-w-4xl py-2">
        <a
          href={`/dashboard/projects/${projectId}`}
          className="inline-flex min-h-11 items-center text-sm font-medium text-muted hover:text-primary"
        >
          ← All runs
        </a>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">Run #{run.id}</h1>
          <details className="relative">
            <summary aria-label="Run actions"
              className="flex size-11 cursor-pointer list-none items-center justify-center rounded-lg text-xl text-muted hover:bg-panel">
              <span aria-hidden="true">···</span>
            </summary>
            <div className="absolute right-0 z-20 mt-2 flex max-h-[70svh] w-72 max-w-[calc(100vw-2rem)] flex-col overflow-y-auto gap-3 rounded-xl border border-line bg-page p-4 shadow-lg">
              {canConnectAgent && <CopyAgentPrompt projectId={projectId} runId={runNumber} />}
              <CopyRunDetails details={JSON.stringify(details, null, 2)} />
              <RunArchiveButton projectId={projectId} runId={runNumber} archived={!!run.archived_at} active={active} />
              <dl className="space-y-3 border-t border-line pt-3 text-xs">
                <div><dt className="text-muted">Repository</dt><dd className="mt-1 break-words">{run.repo_full_name || project.repo_full_name}</dd></div>
                {run.target_url && <div><dt className="text-muted">Tested URL</dt><dd className="mt-1 break-all">{run.target_url}</dd></div>}
                {run.target_ref && <div><dt className="text-muted">Branch</dt><dd className="mt-1 break-words">{run.target_ref}</dd></div>}
                {run.auth_profile_name && <div><dt className="text-muted">Profile</dt><dd className="mt-1 break-words">{run.auth_profile_name}</dd></div>}
                <div><dt className="text-muted">Started</dt><dd className="mt-1">{new Date(run.created_at).toLocaleString("en-US")}</dd></div>
              </dl>
            </div>
          </details>
        </div>
        {run.archived_at && (
          <p role="status" className="mt-4 text-sm text-muted">
            Archived · This report and its evidence are still available. Restore
            it to return it to your runs list.
          </p>
        )}
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>{runStatusLabel(details.status)}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={run.created_at} title={new Date(run.created_at).toLocaleString("en-US")}>
            {new Date(run.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </time>
        </p>
        {details.reason && (
          <p role="status" className="mt-4 text-sm text-muted">
            {details.reason}
          </p>
        )}
        <RunReportRefresh active={active} />
        {!findings.length ? (
          <div className="mt-10 border-y border-line py-8">
            <h2 id="fixes-heading" className="text-base font-medium">
              {active
                ? "Agents are collecting evidence."
                : "No findings recorded."}
            </h2>
            <p className="mt-3 text-muted">
              {active
                ? "Findings will appear here as they are saved."
                : ["completed", "done", "partial"].includes(details.status)
                  ? report.testResults?.some((r) =>
                      [
                        "blocked",
                        "needs_review",
                        "inconclusive",
                        "not_tested",
                      ].includes(r.status),
                    )
                    ? "No confirmed bugs were recorded. See test coverage for remaining blockers and follow-up results."
                    : "This run finished without any recorded findings."
                  : "This run ended without recorded findings. You can start another run from the project."}
            </p>
          </div>
        ) : (
          <FixesTable
            findings={findings}
            projectId={projectId}
            runId={runNumber}
            isGuest={owner.startsWith("guest:")}
          />
        )}
        <div className="mt-10">
          <TestStepResults results={report.testResults || []} />
          <DatabaseCheckResults checks={report.databaseChecks || []} />
          {!!agentReviews.length && <details className="border-b border-line py-1">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Agent reviews</summary>
            <RunAgentReviews reviews={agentReviews} />
          </details>}
        </div>
        {!!run.database_snapshot && project.owner_github_id === owner && (
          <a
            href={`/dashboard/projects/${projectId}/database?run=${runNumber}#cleanup`}
            className="mt-4 inline-flex min-h-11 items-center text-xs text-muted hover:text-primary"
          >
            Review test-record cleanup →
          </a>
        )}
      </div>
    </main>
  );
}
