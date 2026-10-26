import { createHmac, timingSafeEqual } from "node:crypto";
import { encode } from "next-auth/jwt";
import { getSql } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import {
  profileKey,
  encryptProfile,
  ProfileError,
  type ProfileState,
} from "@/lib/auth-profile-state";
import { openTestAccount } from "@/lib/profile-generation";
import { SITE_URL } from "@/lib/site";

export const TEST_USER_COOKIE = "__Secure-authjs.session-token";
const SESSION_SECONDS = 60 * 60;
export type IssuerRequest = {
  captureId: string;
  owner: string;
  projectId: number;
  workToken: string;
  timestamp: number;
};
export function signTestUserRequest(body: string) {
  return createHmac("sha256", profileKey())
    .update(`preflight:test-user-issuer:v1\n${body}`)
    .digest("hex");
}
export function verifyTestUserRequest(body: string, signature: string) {
  if (!/^[a-f0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(signTestUserRequest(body), "hex"),
  );
}
export async function issueTestUser(
  input: IssuerRequest,
): Promise<ProfileState> {
  if (
    !/^[a-f0-9-]{36}$/i.test(input.captureId) ||
    !/^[a-f0-9-]{36}$/i.test(input.workToken) ||
    !Number.isSafeInteger(input.projectId) ||
    typeof input.owner !== "string" ||
    !Number.isFinite(input.timestamp) ||
    Math.abs(Date.now() - input.timestamp) > 60_000
  )
    throw new Error("Invalid or expired issuer request.");
  const secret = process.env.AUTH_SECRET;
  if (!secret)
    throw new Error("Test-user issuer requires AUTH_SECRET in the web app.");
  await ensureSchema();
  const sql = getSql();
  const rows =
    await sql`SELECT c.* FROM profile_captures c JOIN projects p ON p.id=c.project_id WHERE c.id=${input.captureId}::uuid AND c.owner_github_id=${input.owner} AND c.project_id=${input.projectId} AND p.owner_github_id=${input.owner} AND c.origin=${SITE_URL} AND c.automation_token=${input.workToken}::uuid AND c.status='active' AND c.automation_status='running' AND c.expires_at>NOW()`;
  const capture = (rows as any[])[0];
  if (!capture) throw new Error("This provisioning grant is unavailable.");
  const account = openTestAccount(
    capture.automation_credentials,
    input.owner,
    capture.origin,
    capture.id,
  );
  const id = `test:${capture.id}`;
  await sql`INSERT INTO test_users(id,capture_id,owner_github_id,project_id,name,email,expires_at)
    VALUES(${id},${capture.id}::uuid,${input.owner},${input.projectId},${account.name},${account.email},NOW()+INTERVAL '1 hour')
    ON CONFLICT(capture_id) DO NOTHING`;
  const existing =
    await sql`SELECT id,name,email,expires_at FROM test_users WHERE id=${id} AND capture_id=${capture.id}::uuid AND owner_github_id=${input.owner} AND project_id=${input.projectId} AND revoked_at IS NULL AND expires_at>NOW()`;
  const user = (existing as any[])[0];
  if (!user || user.email !== account.email)
    throw new Error("The test identity is unavailable.");
  const maxAge = Math.max(
    1,
    Math.floor((new Date(user.expires_at).getTime() - Date.now()) / 1000),
  );
  return testUserState(user, maxAge);
}
async function testUserState(
  user: { id: string; name: string; email: string },
  maxAge = SESSION_SECONDS,
): Promise<ProfileState> {
  const secret = process.env.AUTH_SECRET;
  if (!secret)
    throw new ProfileError(
      "PreFlight session renewal requires AUTH_SECRET in the web app.",
    );
  const token = await encode({
    secret,
    salt: TEST_USER_COOKIE,
    maxAge,
    token: {
      sub: user.id,
      name: user.name,
      email: user.email,
      preflightTestIdentity: true,
      preflightSessionExpiresAt: Date.now() + maxAge * 1000,
    },
  });
  return {
    cookies: [
      {
        name: TEST_USER_COOKIE,
        value: token,
        domain: new URL(SITE_URL).hostname,
        path: "/",
        secure: true,
        httpOnly: true,
        sameSite: "Lax",
        expires: Date.now() / 1000 + maxAge,
      },
    ],
    origins: [],
    headers: {},
  };
}
/** PRE_FLIGHT_TEST_ISSUER: distinct identities, never a GitHub/admin impersonation. */
export async function validateTestUserSession(id: string) {
  if (!/^test:[a-f0-9-]{36}$/i.test(id)) return false;
  try {
    await ensureSchema();
    const rows =
      await getSql()`SELECT u.id FROM test_users u JOIN profile_captures c ON c.id=u.capture_id JOIN projects p ON p.id=u.project_id
      WHERE u.id=${id} AND u.revoked_at IS NULL AND (u.expires_at IS NULL OR u.expires_at>NOW()) AND p.owner_github_id=u.owner_github_id AND c.owner_github_id=u.owner_github_id AND c.project_id=u.project_id
      AND ((c.status='active' AND c.expires_at>NOW()) OR (c.status='completed' AND EXISTS(SELECT 1 FROM auth_profiles a WHERE a.source_capture_id=c.id AND a.owner_github_id=u.owner_github_id AND a.project_id=u.project_id AND a.revoked_at IS NULL)))`;
    return (rows as any[]).length === 1;
  } catch {
    return false;
  }
}

/** Web-server only. A valid saved profile authorizes renewal of its own isolated identity. */
export async function refreshTestUserProfile(
  owner: string,
  projectId: number,
  profileId: number,
  run?: { id: number; targetUrl: string },
) {
  if (
    !owner ||
    !Number.isSafeInteger(projectId) ||
    projectId <= 0 ||
    !Number.isSafeInteger(profileId) ||
    profileId <= 0
  )
    throw new ProfileError("Choose a valid saved profile.");
  await ensureSchema();
  const sql = getSql();
  const rows =
    await sql`SELECT u.id,u.name,u.email,u.revoked_at FROM auth_profiles a
    JOIN test_users u ON u.capture_id=a.source_capture_id AND u.id='test:'||a.source_capture_id::text
    JOIN profile_captures c ON c.id=u.capture_id JOIN projects p ON p.id=a.project_id
    WHERE a.id=${profileId} AND a.owner_github_id=${owner} AND a.project_id=${projectId}
      AND a.origin=${SITE_URL} AND a.revoked_at IS NULL AND c.status='completed'
      AND u.owner_github_id=a.owner_github_id AND u.project_id=a.project_id
      AND c.owner_github_id=a.owner_github_id AND c.project_id=a.project_id AND c.origin=a.origin
      AND p.owner_github_id=a.owner_github_id`;
  const user = (
    rows as {
      id: string;
      name: string;
      email: string;
      revoked_at: string | null;
    }[]
  )[0];
  if (!user) return null; // Imported sessions and other providers have no trusted issuer here.
  if (user.revoked_at)
    throw new ProfileError(
      "This test account was revoked. Generate a new profile.",
    );
  if (
    run &&
    (!Number.isSafeInteger(run.id) ||
      run.id <= 0 ||
      new URL(run.targetUrl).origin !== SITE_URL)
  )
    throw new ProfileError("This run does not match the profile's app.");
  const state = await testUserState(user);
  const encrypted = encryptProfile(state, owner, SITE_URL);
  const runId = run?.id ?? null,
    targetUrl = run?.targetUrl ?? null;
  // Lock the current grants and recheck revocation in the same statement that
  // saves credentials. A canceled/completed run cannot renew its old snapshot.
  const updated = await sql`WITH run_grant AS (
    SELECT r.id FROM runs r WHERE r.id=${runId}::int AND r.project_id=${projectId}
      AND r.auth_profile_id=${profileId} AND r.target_url=${targetUrl}
      AND r.auth_profile_snapshot->>'origin'=${SITE_URL}
      AND r.status IN ('queued','planning','planned','running') FOR UPDATE
  ), profile_grant AS (
    SELECT a.id,u.id AS user_id FROM auth_profiles a JOIN projects p ON p.id=a.project_id
    JOIN test_users u ON u.capture_id=a.source_capture_id AND u.id='test:'||a.source_capture_id::text
    JOIN profile_captures c ON c.id=u.capture_id
    WHERE a.id=${profileId} AND a.owner_github_id=${owner} AND a.project_id=${projectId}
      AND p.owner_github_id=${owner} AND a.revoked_at IS NULL AND a.origin=${SITE_URL}
      AND u.id=${user.id} AND u.revoked_at IS NULL AND u.owner_github_id=${owner} AND u.project_id=${projectId}
      AND c.status='completed' AND c.owner_github_id=${owner} AND c.project_id=${projectId} AND c.origin=a.origin
      AND (${runId}::int IS NULL OR EXISTS(SELECT 1 FROM run_grant)) FOR UPDATE OF a,u,c,p
  ), identity_update AS (
    UPDATE test_users u SET expires_at=NULL FROM profile_grant g WHERE u.id=g.user_id RETURNING u.id
  ), profile_update AS (
    UPDATE auth_profiles a SET encrypted_state=${encrypted} FROM profile_grant g
    WHERE a.id=g.id RETURNING a.id
  ), run_update AS (
    UPDATE runs r SET auth_profile_snapshot=jsonb_set(r.auth_profile_snapshot,'{encrypted_state}',to_jsonb(${encrypted}::text))
    FROM profile_update a WHERE r.id=${runId}::int AND r.auth_profile_id=a.id AND EXISTS(SELECT 1 FROM run_grant) RETURNING r.id
  ) SELECT id FROM profile_update WHERE ${runId}::int IS NULL OR EXISTS(SELECT 1 FROM run_update)`;
  if (!(updated as any[]).length)
    throw new ProfileError(
      "The profile was revoked or the run is no longer active. Start a new run with an active profile.",
    );
  return state;
}

export async function refreshRunTestUser(runId: number) {
  if (!Number.isSafeInteger(runId) || runId <= 0)
    throw new ProfileError("Choose a valid run.");
  await ensureSchema();
  const rows =
    await getSql()`SELECT r.project_id,r.auth_profile_id,r.target_url,p.owner_github_id
    FROM runs r JOIN projects p ON p.id=r.project_id WHERE r.id=${runId}
    AND r.status IN ('queued','planning','planned','running')`;
  const run = (rows as any[])[0];
  if (
    !run ||
    !run.auth_profile_id ||
    new URL(run.target_url).origin !== SITE_URL
  )
    throw new ProfileError("This run cannot renew a PreFlight test session.");
  const state = await refreshTestUserProfile(
    run.owner_github_id,
    run.project_id,
    run.auth_profile_id,
    { id: runId, targetUrl: run.target_url },
  );
  if (!state)
    throw new ProfileError(
      "This profile has no supported automatic session issuer.",
    );
}
