import { notFound } from "next/navigation";
import { projectPage } from "@/lib/project-page";
import { projectCollaboration } from "@/lib/project-collaboration";
import ProjectCollaborators from "@/components/ProjectCollaborators";
export default async function CollaborationPage({ params }: { params: Promise<{ id: string }> }) {
  const { project, owner } = await projectPage((await params).id, "/collaboration");
  if (owner.startsWith("test:")) notFound();
  const initial = await projectCollaboration(project.id, owner);
  return <main className="py-2"><h1 className="text-3xl font-semibold tracking-tight">Collaboration</h1>
    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">Members can run swarms, review reports and open fix PRs. The owner manages invitations, settings and connections.</p>
    <ProjectCollaborators projectId={project.id} ownerLogin={project.repo_full_name.split("/")[0]} initial={initial} />
  </main>;
}
