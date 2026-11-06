import DeleteProjectButton from "@/components/DeleteProjectButton";
import ProjectLogo from "@/components/ProjectLogo";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { listProjects } from "@/lib/schema";
import InviteCard from "@/components/InviteCard";
import { runStatusLabel } from "@/lib/run-details";

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

  return (
    <main className="min-h-[calc(100svh-5rem)] bg-page">
      <div className="workspace-content mx-auto px-6 py-14">
        <div className="workspace-page-heading flex flex-wrap items-center justify-between gap-5">
          <div>
            <h1
              id="projects-heading"
              tabIndex={-1}
              className="outline-none font-sans text-3xl font-semibold tracking-tight text-ink dark:text-white"
            >
              Projects
            </h1>
            <p className="mt-2 text-sm text-muted dark:text-muted">
              Choose an app to review its runs, or connect a repository.
            </p>
          </div>
          {!session.user.isGuest && (
            <a
              href="/dashboard/projects/new"
              className="pressable btn-primary shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-medium text-white md:px-5 md:py-2.5 md:text-sm"
            >
              New project
            </a>
          )}
        </div>

        {projects.length === 0 ? (
          <div className="mt-10 rounded-lg bg-panel px-6 py-10 md:px-8">
            <p className="font-display text-lg font-bold text-ink dark:text-white">
              No projects yet
            </p>
            <p className="mt-3 max-w-md text-base leading-relaxed text-muted">
              Connect an app URL and a GitHub repository to run your first
              swarm.
            </p>
            <a
              href="/dashboard/projects/new"
              className="pressable btn-primary mt-6 inline-block rounded-full px-6 py-3 text-sm font-medium text-white"
            >
              Create your first project
            </a>
          </div>
        ) : (
          <ul className="project-list">
            {projects.map((project) => (
              <li key={project.id} className="project-row">
                <a
                  href={`/dashboard/projects/${project.id}`}
                  className="project-row-link group"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <ProjectLogo
                      projectId={project.id}
                      imageUrl={project.image_url}
                      appUrl={
                        project.app_url || project.latest_target_url || null
                      }
                      name={project.display_name || project.repo_full_name}
                    />
                    <div className="min-w-0">
                      <h2 title={project.repo_full_name}
                        className="truncate text-lg font-semibold tracking-tight text-ink group-hover:text-primary dark:text-white">
                        {project.display_name || project.repo_full_name.split("/").pop()}
                      </h2>
                      {project.role === "member" && (
                        <p className="mt-1 text-xs text-muted">
                          Shared with you
                        </p>
                      )}
                      <p title={project.app_url ?? "Default branch preview deployment"} className="project-row-url mt-2 text-sm leading-relaxed text-muted">
                        {project.app_url ?? "Default branch preview deployment"}
                      </p>
                    </div>
                  </div>
                  <div className="project-row-status text-sm sm:text-right">
                    {project.latest_run ? (
                      <>
                        <p className={`font-medium ${["failed", "partial"].includes(project.latest_run.status) ? "text-red-600 dark:text-red-400" : "text-ink dark:text-white"}`}>
                          {runStatusLabel(project.latest_run.status)} · {project.latest_run.findings_count} finding{project.latest_run.findings_count === 1 ? "" : "s"}
                        </p>
                        <p className="mt-1 text-xs text-muted">Last run {formatDate(project.latest_run.created_at)}</p>
                      </>
                    ) : (
                      <p className="text-muted">No runs yet</p>
                    )}
                  </div>
                </a>
                {project.role === "owner" && !session.user.isGuest && (
                  <DeleteProjectButton
                    projectId={project.id}
                    name={project.display_name || project.repo_full_name}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {!session.user.isGuest &&
          !session.user.isTestUser &&
          !githubId.startsWith("test:") && <InviteCard />}
      </div>
    </main>
  );
}
