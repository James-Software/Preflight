import { auth } from "@/auth";
import { projectPage } from "@/lib/project-page";
import ProjectSidebar from "@/components/ProjectSidebar";
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  // Let each page preserve its own deep link when requesting sign-in.
  if (!(await auth())?.user?.githubId) return children;
  const { project, owner } = await projectPage((await params).id);
  return (
    <div className="mx-auto grid max-w-[1440px] gap-7 px-4 py-6 text-ink dark:text-white sm:px-6 lg:grid-cols-[224px_minmax(0,1fr)] lg:gap-10 lg:px-8 lg:py-10">
      <ProjectSidebar
        canManage={project.owner_github_id === owner}
        isTestUser={owner.startsWith("test:") || owner.startsWith("guest:")}
        project={{
          id: project.id,
          name:
            project.display_name ||
            project.repo_full_name.split("/").pop() ||
            project.repo_full_name,
          repo: project.repo_full_name,
          appUrl: project.app_url || project.latest_target_url || null,
          imageUrl: project.image_url,
        }}
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
