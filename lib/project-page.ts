import { auth } from "@/auth";
import { getProject } from "@/lib/schema";
import { redirect, notFound } from "next/navigation";
export async function projectPage(id: string, section = "") {
  const owner = (await auth())?.user?.githubId;
  if (!owner)
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/dashboard/projects/${id}${section}`)}`,
    );
  const number = Number(id);
  if (!Number.isSafeInteger(number) || number <= 0) notFound();
  const project = await getProject(number, owner, "member");
  if (!project) notFound();
  return { project, owner };
}
