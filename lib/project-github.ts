import type { NextRequest } from "next/server";
import { getGithubContext, type GithubContext } from "@/lib/github";
import { loadGithubCredentials, GithubRenewalUnavailable } from "@/lib/github-credentials";
import { getProject, type Project } from "@/lib/schema";
import { ProjectRepositoryError as ProjectGithubError } from "@/lib/project-repository-access";
export { ProjectRepositoryError as ProjectGithubError } from "@/lib/project-repository-access";
export async function projectGithubContext(req: NextRequest, project: Project, actor: string): Promise<GithubContext | null> {
  if (project.owner_github_id === actor) return getGithubContext(req);
  if (actor.startsWith("test:") || !(await getProject(project.id, actor, "member")))
    throw new ProjectGithubError("Your access to this project is no longer available.");
  let saved;
  try { saved = await loadGithubCredentials(project.owner_github_id); }
  catch (error) {
    if (error instanceof GithubRenewalUnavailable) throw new ProjectGithubError("The project's GitHub connection is temporarily unavailable. Try again shortly.");
  }
  if (!saved || saved.login.toLowerCase() !== project.repo_full_name.split("/")[0].toLowerCase())
    throw new ProjectGithubError("The project owner needs to reconnect GitHub for this repository.");
  return { ...saved, ownerGithubId: project.owner_github_id,
    projectGrant: { projectId: project.id, actor, owner: project.owner_github_id, repo: project.repo_full_name } };
}
