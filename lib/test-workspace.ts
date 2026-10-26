import { getSql } from "@/lib/db";
import { validateTestUserSession } from "@/lib/test-user-issuer";
import { ProfileError } from "@/lib/auth-profile-state";
import { SITE_URL } from "@/lib/site";

/** A real project in the test identity's workspace; no delegated GitHub access. */
export async function createTestWorkspaceProject(
  owner: string,
  name: string,
  appUrl: string | null,
) {
  if (!name.trim() || name.trim().length > 80)
    throw new ProfileError("Enter a project name of up to 80 characters.");
  if (!(await validateTestUserSession(owner)))
    throw new ProfileError(
      "This test identity is no longer available. Use an active profile.",
    );
  const rows =
    await getSql()`INSERT INTO projects(owner_github_id,app_url,repo_full_name,display_name)
    SELECT u.id,${appUrl},p.repo_full_name,${name.trim()} FROM test_users u
    JOIN profile_captures c ON c.id=u.capture_id JOIN projects p ON p.id=u.project_id
    WHERE u.id=${owner} AND u.revoked_at IS NULL AND (u.expires_at IS NULL OR u.expires_at>NOW())
      AND p.owner_github_id=u.owner_github_id AND c.origin=${SITE_URL}
      AND p.repo_full_name='James-Software/Preflight'
      AND (SELECT count(*) FROM projects WHERE owner_github_id=u.id)<20
    RETURNING id`;
  const project = (rows as { id: number }[])[0];
  if (!project)
    throw new ProfileError(
      "This test workspace is unavailable or has reached its 20-project limit.",
    );
  return project;
}
