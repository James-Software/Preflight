import { createHmac, timingSafeEqual } from "node:crypto";
import { encode } from "next-auth/jwt";
import { getSql } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { profileKey, type ProfileState } from "@/lib/auth-profile-state";
import { openTestAccount } from "@/lib/profile-generation";
import { SITE_URL } from "@/lib/site";

export const TEST_USER_COOKIE = "__Secure-authjs.session-token";
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
  const token = await encode({
    secret,
    salt: TEST_USER_COOKIE,
    maxAge,
    token: {
      sub: id,
      name: user.name,
      email: user.email,
      preflightTestIdentity: true,
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
      WHERE u.id=${id} AND u.revoked_at IS NULL AND u.expires_at>NOW() AND p.owner_github_id=u.owner_github_id AND c.owner_github_id=u.owner_github_id AND c.project_id=u.project_id
      AND ((c.status='active' AND c.expires_at>NOW()) OR (c.status='completed' AND EXISTS(SELECT 1 FROM auth_profiles a WHERE a.source_capture_id=c.id AND a.owner_github_id=u.owner_github_id AND a.project_id=u.project_id AND a.revoked_at IS NULL)))`;
    return (rows as any[]).length === 1;
  } catch {
    return false;
  }
}
