import { getSql } from "@/lib/db";
import { ensureSchema, getProject } from "@/lib/schema";
import {
  decryptProfile,
  encryptProfile,
  parseProfileState,
  profileOrigin,
  ProfileError,
} from "@/lib/auth-profile-state";

export type AuthProfile = {
  id: number;
  name: string;
  origin: string;
  verification_path: string;
  verification_text: string | null;
  created_at: string;
};
export type AuthSnapshot = {
  origin: string;
  encrypted_state: string;
  verification_path: string;
  verification_text: string | null;
};
export async function profileProject(owner: string, projectId: number) {
  if (
    !Number.isSafeInteger(projectId) ||
    projectId <= 0 ||
    !(await getProject(projectId, owner))
  )
    throw new ProfileError("This project is unavailable.");
}
export async function listAuthProfiles(
  owner: string,
  projectId: number,
): Promise<AuthProfile[]> {
  await profileProject(owner, projectId);
  await ensureSchema();
  const rows =
    await getSql()`SELECT id, name, origin, verification_path, verification_text, created_at FROM auth_profiles WHERE owner_github_id = ${owner} AND project_id = ${projectId} AND revoked_at IS NULL ORDER BY created_at DESC`;
  return Array.isArray(rows) ? (rows as AuthProfile[]) : [];
}
export async function createAuthProfile(
  owner: string,
  input: {
    name: string;
    origin: string;
    session: string;
    headers: string;
    verificationPath?: string;
    verificationText?: string;
  },
  projectId: number,
): Promise<AuthProfile> {
  await profileProject(owner, projectId);
  const name = input.name.trim(),
    origin = profileOrigin(input.origin);
  if (!name || name.length > 80)
    throw new ProfileError("Give the profile a name of up to 80 characters.");
  let check: URL;
  try {
    check = new URL(input.verificationPath || "/", origin);
  } catch {
    throw new ProfileError("Enter a valid signed-in page path.");
  }
  if (
    check.origin !== origin ||
    check.username ||
    check.password ||
    check.search ||
    check.hash
  )
    throw new ProfileError(
      "Use a page path on this app origin, without query parameters or fragments.",
    );
  const text = input.verificationText?.trim() || null;
  if (text && text.length > 200)
    throw new ProfileError(
      "Use at most 200 characters for the signed-in text.",
    );
  const state = parseProfileState(origin, input.session, input.headers);
  const encrypted = encryptProfile(state, owner, origin);
  await ensureSchema();
  const rows =
    await getSql()`INSERT INTO auth_profiles (owner_github_id, name, origin, encrypted_state, verification_path, verification_text, project_id)
    VALUES (${owner},${name},${origin},${encrypted},${check.pathname + check.search},${text},${projectId}) RETURNING id, name, origin, verification_path, verification_text, created_at`;
  if (!Array.isArray(rows) || !rows.length)
    throw new Error("Profile could not be saved");
  return rows[0] as AuthProfile;
}
export async function revokeAuthProfile(
  owner: string,
  id: number,
  projectId: number,
): Promise<boolean> {
  await profileProject(owner, projectId);
  await ensureSchema();
  const rows =
    await getSql()`UPDATE auth_profiles SET revoked_at = NOW() WHERE id = ${id} AND owner_github_id = ${owner} AND project_id = ${projectId} AND revoked_at IS NULL RETURNING id`;
  return Array.isArray(rows) && rows.length > 0;
}
export async function profileForRun(
  owner: string,
  id: number,
  targetUrl: string,
  projectId: number,
) {
  await profileProject(owner, projectId);
  await ensureSchema();
  const rows =
    await getSql()`SELECT id, name, origin, encrypted_state, verification_path, verification_text, source_capture_id FROM auth_profiles WHERE id = ${id} AND owner_github_id = ${owner} AND project_id = ${projectId} AND revoked_at IS NULL`;
  const p = Array.isArray(rows)
    ? (rows[0] as
        | (AuthProfile & {
            encrypted_state: string;
            source_capture_id?: string;
          })
        | undefined)
    : null;
  if (!p)
    throw new ProfileError(
      "This profile is unavailable. Choose another profile.",
    );
  if (p.origin !== new URL(targetUrl).origin)
    throw new ProfileError(
      `This profile is for ${p.origin}. Create or choose a profile for ${new URL(targetUrl).origin}.`,
    );
  if (p.origin === "https://www.trypreflight.dev" && p.source_capture_id) {
    const { refreshTestUserProfile } = await import("@/lib/test-user-issuer");
    const refreshed = await refreshTestUserProfile(owner, projectId, id);
    if (refreshed)
      p.encrypted_state = encryptProfile(refreshed, owner, p.origin);
  }
  decryptProfile(p.encrypted_state, owner, p.origin);
  return {
    id: p.id as number,
    name: p.name as string,
    snapshot: {
      origin: p.origin,
      encrypted_state: p.encrypted_state,
      verification_path: p.verification_path,
      verification_text: p.verification_text,
    } as AuthSnapshot,
  };
}
export async function getRunAuthentication(runId: number) {
  const rows =
    await getSql()`SELECT r.auth_profile_snapshot, r.target_url, p.owner_github_id, a.revoked_at, a.id AS profile_id
    FROM runs r JOIN projects p ON p.id = r.project_id LEFT JOIN auth_profiles a ON a.id = r.auth_profile_id AND a.owner_github_id = p.owner_github_id AND (a.project_id=r.project_id OR a.project_id IS NULL) WHERE r.id = ${runId}`;
  const row = Array.isArray(rows)
    ? (rows[0] as
        | {
            profile_id: number;
            revoked_at: string | null;
            auth_profile_snapshot: AuthSnapshot | null;
            target_url: string;
            owner_github_id: string;
          }
        | undefined)
    : null;
  if (!row?.profile_id || row.revoked_at || !row.auth_profile_snapshot)
    throw new ProfileError(
      "The authentication profile was removed. Choose a profile and start a new run.",
    );
  const snapshot = row.auth_profile_snapshot as AuthSnapshot;
  if (new URL(row.target_url).origin !== snapshot.origin)
    throw new ProfileError(
      "The authentication profile does not match the run origin.",
    );
  return {
    ...snapshot,
    state: decryptProfile(
      snapshot.encrypted_state,
      row.owner_github_id,
      snapshot.origin,
    ),
  };
}

export async function listUnassignedProfiles(
  owner: string,
): Promise<AuthProfile[]> {
  await ensureSchema();
  const rows =
    await getSql()`SELECT id,name,origin,verification_path,verification_text,created_at FROM auth_profiles WHERE owner_github_id=${owner} AND project_id IS NULL AND revoked_at IS NULL ORDER BY created_at DESC`;
  return Array.isArray(rows) ? (rows as AuthProfile[]) : [];
}
export async function assignAuthProfile(
  owner: string,
  projectId: number,
  id: number,
) {
  await profileProject(owner, projectId);
  const rows =
    await getSql()`UPDATE auth_profiles SET project_id=${projectId} WHERE id=${id} AND owner_github_id=${owner} AND project_id IS NULL AND revoked_at IS NULL RETURNING id,name,origin,verification_path,verification_text,created_at`;
  if (!Array.isArray(rows) || !rows.length)
    throw new ProfileError("This profile is already assigned or unavailable.");
  return rows[0] as AuthProfile;
}
