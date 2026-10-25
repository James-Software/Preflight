import { projectPage } from "@/lib/project-page";
import { listRuns } from "@/lib/schema";
import RunSwarmButton from "@/components/RunSwarmButton";
import RunsList from "@/components/RunsList";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { project } = await projectPage((await params).id);
  const runs = await listRuns(project.id);
  return (
    <main className="py-2">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Runs</h1>
          <p className="mt-2 text-sm text-muted">
            Start a swarm or review a previous run.
          </p>
        </div>
        <RunSwarmButton projectId={project.id} />
      </div>
      <p className="mt-5 break-all text-sm text-muted">
        {project.app_url ||
          "Using the default branch’s latest preview deployment."}
      </p>
      <RunsList
        projectId={project.id}
        initialRuns={runs.map((r) => ({
          id: r.id,
          status: r.status,
          created_at: r.created_at,
          target_url: r.target_url,
          findingsCount: r.findingsCount,
          archived_at: r.archived_at,
        }))}
      />
    </main>
  );
}
