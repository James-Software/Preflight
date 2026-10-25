import { projectPage } from "@/lib/project-page";
import ProjectGeneralSettings from "@/components/ProjectGeneralSettings";
export default async function ProjectGeneralPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { project } = await projectPage((await params).id, "/general");
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
