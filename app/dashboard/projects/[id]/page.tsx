import ProjectLogo from "@/components/ProjectLogo";
import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import ProjectUrlForm, {
  type ProjectUrlAction,
} from "@/components/ProjectUrlForm";
import { getProject, listRuns, updateProjectAppUrl } from "@/lib/schema";
import RunSwarmButton from "@/components/RunSwarmButton";
import RunsList from "@/components/RunsList";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user)
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/dashboard/projects/${id}`)}`,
    );
  const githubId = session.user.githubId;
  if (!githubId)
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/dashboard/projects/${id}`)}`,
    );

  const projectId = Number(id);
  if (!Number.isInteger(projectId) || projectId <= 0) notFound();

  const project = await getProject(projectId, githubId);
  if (!project) notFound();
  const runs = await listRuns(project.id);

  const saveUrl: ProjectUrlAction = async (_previous, formData) => {
    "use server";
    const caller = await auth();
    const owner = caller?.user?.githubId;
    if (!owner)
      return { error: "Your session expired. Sign in again before saving." };
    const raw = String(formData.get("appUrl") ?? "").trim();
    let appUrl: string | null = null;
    if (raw) {
      try {
        const url = new URL(raw);
        if (!["http:", "https:"].includes(url.protocol)) throw new Error();
        appUrl = url.href;
      } catch {
        return { error: "Enter an app URL starting with http:// or https://." };
      }
    }
    try {
      if (!(await updateProjectAppUrl(projectId, owner, appUrl)))
        return { error: "This project is no longer available." };
      revalidatePath(`/dashboard/projects/${projectId}`);
      return { saved: true };
    } catch {
      return { error: "Could not save the URL. Try again." };
    }
  };

  return (
    <main className="min-h-[calc(100svh-5rem)] bg-page">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <a
          href="/dashboard"
          className="text-sm font-medium text-muted transition-colors duration-150 hover:text-ink dark:text-muted dark:hover:text-white"
        >
          &larr; All projects
        </a>
        <div className="mt-5 flex min-w-0 items-center gap-4">
          <ProjectLogo
            appUrl={project.app_url || project.latest_target_url || null}
            name={project.repo_full_name}
          />
          <h1 className="font-sans min-w-0 break-words text-3xl font-semibold tracking-tight text-ink dark:text-white">
            {project.repo_full_name}
          </h1>
        </div>
        <p className="mt-2 break-all text-sm text-muted dark:text-muted">
          {project.app_url ??
            "Runs test the default branch's latest preview deployment."}
        </p>

        <ProjectUrlForm action={saveUrl} initialUrl={project.app_url} />

        <div className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="font-sans text-xl font-semibold tracking-tight text-ink dark:text-white">
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
              findingsCount: r.findingsCount,
              archived_at: r.archived_at,
            }))}
          />
        </div>
      </div>
    </main>
  );
}
