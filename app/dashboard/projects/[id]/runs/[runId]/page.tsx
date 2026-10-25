import DatabaseCheckResults from "@/components/DatabaseCheckResults";
import { BranchIcon } from "@/components/GitIcons";
import RunArchiveButton from "@/components/RunArchiveButton";
import FixesTable from "@/components/FixesTable";
import ProjectLogo from "@/components/ProjectLogo";
import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { getProject, getRunReport } from "@/lib/schema";
import RunReportRefresh from "@/components/RunReportRefresh";

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
      <div className="mx-auto max-w-6xl px-6 py-12">
        <a
          href={`/dashboard/projects/${projectId}`}
          className="inline-flex min-h-11 items-center text-sm font-medium text-muted hover:text-primary"
        >
          ← All runs
        </a>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">
            Run #{run.id}
          </h1>
          <RunArchiveButton
            projectId={projectId}
            runId={runNumber}
            archived={!!run.archived_at}
            active={active}
          />
        </div>
        {run.archived_at && (
          <p role="status" className="mt-4 text-sm text-muted">
            Archived · This report and its evidence are still available. Restore
            it to return it to your runs list.
          </p>
        )}
        <div className="mt-4 flex items-center gap-3">
          <ProjectLogo
            projectId={project.id}
            appUrl={project.app_url || run.target_url}
            name={project.repo_full_name}
          />
          <p className="min-w-0 break-words text-muted">
            {project.repo_full_name}
          </p>
        </div>
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
        {(run.target_ref || run.auth_profile_name) && (
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
            {run.target_ref && (
              <span className="inline-flex min-w-0 items-center gap-2 break-all">
                <BranchIcon />
                {run.target_ref}
              </span>
            )}
            {run.auth_profile_name && (
              <span>Profile · {run.auth_profile_name}</span>
            )}
          </div>
        )}
        {run.target_url && (
          <p className="mt-4 break-all text-sm text-muted">
            Tested URL: {run.target_url}
          </p>
        )}
        <div className="mt-6">
          <RunReportRefresh active={active} />
        </div>
        <DatabaseCheckResults checks={report.databaseChecks || []} />
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
                : ["completed", "done"].includes(run.status)
                  ? "This run finished without any recorded findings."
                  : "This run ended without recorded findings. You can start another run from the project."}
            </p>
          </div>
        ) : (
          <FixesTable
            findings={findings}
            projectId={projectId}
            runId={runNumber}
          />
        )}
      </div>
    </main>
  );
}
