import { redirect } from "next/navigation";
import { projectPage } from "@/lib/project-page";
export default async function ProjectCleanupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ run?: string }>;
}) {
  const { project } = await projectPage((await params).id, "/cleanup");
  const query = await searchParams;
  const search =
    typeof query.run === "string"
      ? `?${new URLSearchParams({ run: query.run })}`
      : "";
  redirect(`/dashboard/projects/${project.id}/database${search}#cleanup`);
}
