import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { getProject, listRuns } from "@/lib/schema";
import DashboardHeader from "@/components/DashboardHeader";

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
        <p className="mt-2 text-sm text-ink/60">{project.app_url}</p>

        <div className="mt-10">
          <h2 className="font-display text-xl font-bold tracking-tight text-ink">
            Runs
          </h2>
          {runs.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-mist bg-lavender/50 px-8 py-14 text-center">
              <p className="font-display text-lg font-bold text-ink">
                No runs yet
              </p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink/60">
                Runs ship in the next milestone. Once they do, your swarm
                results will land here.
              </p>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {runs.map((run) => (
                <li
                  key={run.id}
                  className="flex items-center justify-between rounded-xl border border-mist px-5 py-4"
                >
                  <span className="text-sm font-medium text-ink">
                    Run #{run.id}
                  </span>
                  <span className="text-xs font-medium uppercase tracking-wide text-ink/50">
                    {run.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
