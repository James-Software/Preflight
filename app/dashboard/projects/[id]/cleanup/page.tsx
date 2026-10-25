import Link from "next/link";
import { notFound } from "next/navigation";
import { projectPage } from "@/lib/project-page";
import { listProjectCleanupRuns } from "@/lib/database-cleanup";
import DatabaseCleanup from "@/components/DatabaseCleanup";
import CleanupRunPicker from "@/components/CleanupRunPicker";
export default async function ProjectCleanupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ run?: string }>;
}) {
  const { project, owner } = await projectPage((await params).id, "/cleanup");
  const runs = await listProjectCleanupRuns(project.id, owner);
  const query = await searchParams;
  const selected =
    query.run === undefined
      ? runs.find((run) => run.pending_count > 0) || runs[0]
      : runs.find((run) => String(run.id) === query.run);
  if (query.run !== undefined && !selected) notFound();
  return (
    <main className="py-2">
      <h1 className="text-3xl font-semibold tracking-tight">Cleanup</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        Review test records from this project’s runs and choose which ones to
        remove.
      </p>
      {selected ? (
        <>
          <CleanupRunPicker
            projectId={project.id}
            runs={runs}
            selected={selected.id}
          />
          <Link
            className="pressable mt-3 inline-flex min-h-11 items-center text-sm text-primary"
            href={`/dashboard/projects/${project.id}/runs/${selected.id}`}
          >
            View run report →
          </Link>
          <DatabaseCleanup
            key={selected.id}
            projectId={project.id}
            runId={selected.id}
            active={["queued", "planning", "planned", "running"].includes(
              selected.status,
            )}
            heading="Proposed actions"
          />
        </>
      ) : (
        <div className="mt-8 rounded-lg border border-line p-6">
          <p className="text-sm text-muted">
            No database-enabled runs yet. Connect a database and enable
            verification when you start a swarm.
          </p>
          <Link
            className="pressable mt-3 inline-flex min-h-11 items-center text-sm text-primary"
            href={`/dashboard/projects/${project.id}`}
          >
            Go to runs →
          </Link>
        </div>
      )}
    </main>
  );
}
