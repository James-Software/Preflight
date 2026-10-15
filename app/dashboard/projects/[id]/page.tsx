import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { getProject, listRuns } from "@/lib/schema";
import DashboardHeader from "@/components/DashboardHeader";
import RunSwarmButton from "@/components/RunSwarmButton";
import RunsList from "@/components/RunsList";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const githubId = session.user.githubId;
  if (!githubId) redirect("/login");

  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId) || projectId <= 0) notFound();

  const project = await getProject(projectId, githubId);
  if (!project) notFound();
  const runs = await listRuns(project.id);

  return (
    <main className="min-h-screen bg-white">
      <DashboardHeader user={session.user} />
      <div className="mx-auto max-w-6xl px-6 py-14">
        <a
          href="/dashboard"
          className="text-sm font-medium text-ink/60 transition-colors duration-150 hover:text-ink"
        >
          &larr; All projects
        </a>
        <h1 className="font-display mt-4 text-3xl font-bold tracking-tight text-ink">
          {project.repo_full_name}
        </h1>
        <p className="mt-2 text-sm text-ink/60">
          {project.app_url ??
            "Runs test the default branch's latest preview deployment."}
        </p>

        <div className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-bold tracking-tight text-ink">
              Runs
            </h2>
            <RunSwarmButton projectId={project.id} />
          </div>
          <RunsList
            projectId={project.id}
            initialRuns={runs.map((r) => ({
              id: r.id,
              status: r.status,
              created_at: r.created_at,
              target_url: r.target_url,
              findingsCount: 0,
            }))}
          />
        </div>
      </div>
    </main>
  );
}
