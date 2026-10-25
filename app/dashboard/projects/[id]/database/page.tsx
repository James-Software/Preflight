import Link from "next/link";
import { notFound } from "next/navigation";
import { listProjectCleanupRuns } from "@/lib/database-cleanup";
import DatabaseCleanup from "@/components/DatabaseCleanup";
import CleanupRunPicker from "@/components/CleanupRunPicker";
import { projectPage } from "@/lib/project-page";
import { listProjectDatabases } from "@/lib/database-connections";
import DatabaseSettings from "@/components/DatabaseSettings";
export default async function ProjectDatabasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ run?: string }>;
}) {
  const { project, owner } = await projectPage((await params).id, "/database");
  const [databases, runs] = await Promise.all([
    listProjectDatabases(project.id, owner),
    listProjectCleanupRuns(project.id, owner),
  ]);
  const query = await searchParams;
  const selected =
    query.run === undefined
      ? runs.find((run) => run.pending_count > 0) || runs[0]
      : runs.find((run) => String(run.id) === query.run);
  if (query.run !== undefined && !selected) notFound();
  let origin = "";
  try {
    origin = new URL(project.app_url || project.latest_target_url || "").origin;
  } catch {}
  return (
    <main className="py-2">
      <h1 className="text-3xl font-semibold tracking-tight">Database</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Manage connections, verification checks and test-record cleanup for this
        project.
      </p>
      <DatabaseSettings
        projectId={project.id}
        initialConnections={databases}
        defaultOrigin={origin}
        expanded
      />
      <section
        id="cleanup"
        className="mt-10 scroll-mt-28 border-t border-line pt-8"
        aria-labelledby="project-cleanup-title"
      >
        <h2
          id="project-cleanup-title"
          className="text-xl font-semibold tracking-tight"
        >
          Cleanup
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
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
          <p className="mt-4 text-sm text-muted">
            No database-enabled runs yet. Enable verification when you start a
            swarm to review its cleanup here.
          </p>
        )}
      </section>
    </main>
  );
}
