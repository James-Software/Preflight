import { projectPage } from "@/lib/project-page";
import { listProjectDatabases } from "@/lib/database-connections";
import DatabaseSettings from "@/components/DatabaseSettings";
export default async function ProjectDatabasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { project, owner } = await projectPage((await params).id, "/database");
  const databases = await listProjectDatabases(project.id, owner);
  let origin = "";
  try {
    origin = new URL(project.app_url || project.latest_target_url || "").origin;
  } catch {}
  return (
    <main className="py-2">
      <h1 className="text-3xl font-semibold tracking-tight">Database</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Manage database connections and verification checks for this project.
      </p>
      <DatabaseSettings
        projectId={project.id}
        initialConnections={databases}
        defaultOrigin={origin}
        expanded
      />
    </main>
  );
}
