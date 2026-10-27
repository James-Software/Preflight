import { projectPage } from "@/lib/project-page";
import ProjectGeneralSettings from "@/components/ProjectGeneralSettings";
export default async function ProjectGeneralPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { project, owner } = await projectPage((await params).id, "/general");
  if (project.owner_github_id !== owner) return <main className="py-2"><h1 className="text-3xl font-semibold">General info</h1><p className="mt-3 text-sm text-muted">The project owner manages these settings.</p></main>;
  return (
    <main className="py-2">
      <h1 className="text-3xl font-semibold tracking-tight">General info</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Update your project’s identity, app URL and GitHub repository.
      </p>
      <ProjectGeneralSettings
        project={{
          id: project.id,
          displayName: project.display_name || "",
          appUrl: project.app_url || "",
          repo: project.repo_full_name,
          imageUrl: project.image_url || null,
        }}
      />
    </main>
  );
}
