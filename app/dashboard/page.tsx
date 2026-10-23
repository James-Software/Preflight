import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { listProjects } from "@/lib/schema";
import InviteCard from "@/components/InviteCard";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function Dashboard() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fdashboard");
  const githubId = session.user.githubId;
  if (!githubId) redirect("/login?callbackUrl=%2Fdashboard");

  const projects = await listProjects(githubId);
  const user = session.user;

  return (
    <main className="min-h-[calc(100svh-5rem)] bg-page">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div>
            <h1 className="font-sans text-3xl font-semibold tracking-tight text-ink dark:text-white">
              Projects
            </h1>
            <p className="mt-2 text-sm text-muted dark:text-muted">
              Every app the swarm is cleared to test.
            </p>
          </div>
          <a
            href="/dashboard/projects/new"
            className="pressable btn-gradient shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-medium text-white md:px-5 md:py-2.5 md:text-sm"
          >
            New project
          </a>
        </div>

        {projects.length === 0 ? (
          <div className="mt-10 rounded-2xl border px-8 py-14 text-center border-line bg-panel">
            <p className="font-display text-lg font-bold text-ink dark:text-white">
              No projects yet
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted dark:text-muted">
              Connect an app URL and a GitHub repository to run your first
              swarm.
            </p>
            <a
              href="/dashboard/projects/new"
              className="pressable btn-gradient mt-6 inline-block rounded-full px-6 py-3 text-sm font-medium text-white"
            >
              Create your first project
            </a>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <a
                key={project.id}
                href={`/dashboard/projects/${project.id}`}
                className="group rounded-2xl border px-6 py-5 transition-colors duration-200 hover:border-ink/25 dark:hover:border-white/25 bg-surface border-line"
              >
                <p className="font-display text-base font-bold tracking-tight text-ink dark:text-white">
                  {project.repo_full_name}
                </p>
                <p className="mt-1 truncate text-sm text-muted dark:text-muted">
                  {project.app_url ?? "Default branch preview deployment"}
                </p>
                <p className="mt-3 text-xs text-muted dark:text-muted">
                  Created {formatDate(project.created_at)}
                </p>
              </a>
            ))}
          </div>
        )}
        <InviteCard />
      </div>
    </main>
  );
}
