import { getSql } from "@/lib/db";
export type ProjectRepositoryGrant = { projectId: number; actor: string; owner: string; repo: string };
export class ProjectRepositoryError extends Error {}

/** Rechecked on every delegated GitHub request, including queued PR workers. */
export async function assertProjectRepositoryAccess(grant: ProjectRepositoryGrant, url: URL) {
  // GitHub ref names can contain encoded slashes; normalize before checking scope.
  let path: string;
  try { path = new URL(decodeURIComponent(url.pathname), url.origin).pathname.toLowerCase(); }
  catch { throw new ProjectRepositoryError("Invalid repository request."); }
  if (url.origin !== "https://api.github.com" || !grant || !Number.isSafeInteger(grant.projectId) || typeof grant.actor !== "string" ||
    grant.actor.startsWith("test:") || typeof grant.owner !== "string" ||
    !/^[\w.-]+\/[\w.-]+$/.test(grant.repo) ||
    !(path === `/repos/${grant.repo}`.toLowerCase() || path.startsWith(`/repos/${grant.repo}/`.toLowerCase())))
    throw new ProjectRepositoryError("This GitHub request is outside the shared project.");
  const rows = await getSql()`SELECT p.id FROM projects p JOIN project_members m ON m.project_id=p.id
    WHERE p.id=${grant.projectId} AND p.owner_github_id=${grant.owner} AND p.repo_full_name=${grant.repo} AND m.user_id=${grant.actor}
      AND (${!grant.actor.startsWith("guest:")} OR EXISTS(SELECT 1 FROM guest_demo_sessions s JOIN guest_demo_links l ON l.token_hash=s.link_hash
        WHERE s.actor_id=m.user_id AND s.project_id=p.id AND s.revoked_at IS NULL AND s.expires_at>NOW() AND l.revoked_at IS NULL AND l.expires_at>NOW()))`;
  if (!(rows as any[]).length) throw new ProjectRepositoryError("Your access to this shared project has ended.");
}
