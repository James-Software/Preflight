import { getSql } from "@/lib/db";
import { ProfileError } from "@/lib/auth-profile-state";
import { signTestUserRequest } from "@/lib/test-user-issuer";
import { SITE_URL } from "@/lib/site";

/** Worker: web keeps AUTH_SECRET and renews only this run's managed identity. */
export async function renewRunAuthentication(runId: number) {
  const rows =
    await getSql()`SELECT r.id FROM runs r JOIN projects p ON p.id=r.project_id
    JOIN auth_profiles a ON a.id=r.auth_profile_id AND a.owner_github_id=p.owner_github_id AND a.project_id=p.id
    JOIN test_users u ON u.capture_id=a.source_capture_id AND u.owner_github_id=a.owner_github_id AND u.project_id=a.project_id
    WHERE r.id=${runId} AND a.origin=${SITE_URL} AND u.id='test:'||a.source_capture_id::text
      AND a.revoked_at IS NULL AND r.auth_profile_snapshot->>'origin'=a.origin`;
  if (!(rows as any[]).length) return false;
  const body = JSON.stringify({
    action: "renew-run",
    runId,
    timestamp: Date.now(),
  });
  try {
    const response = await fetch(new URL("/api/profiles/renew", SITE_URL), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-preflight-issuer-signature": signTestUserRequest(body),
      },
      body,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok || (await response.json()).renewed !== true)
      throw new Error("Renewal unavailable");
  } catch {
    throw new ProfileError(
      "Could not renew this saved test session before the run. Confirm the latest web and Trigger deployments are ready and use the same PROFILE_ENCRYPTION_KEY. Revoked profiles cannot be renewed.",
    );
  }
  return true;
}
