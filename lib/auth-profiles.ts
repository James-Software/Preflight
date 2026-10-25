import { getSql } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
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
export async function listAuthProfiles(owner: string): Promise<AuthProfile[]> {
  await ensureSchema();
  const rows =
    await getSql()`SELECT id, name, origin, verification_path, verification_text, created_at FROM auth_profiles WHERE owner_github_id = ${owner} AND revoked_at IS NULL ORDER BY created_at DESC`;
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
): Promise<AuthProfile> {
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
    await getSql()`INSERT INTO auth_profiles (owner_github_id, name, origin, encrypted_state, verification_path, verification_text)
    VALUES (${owner},${name},${origin},${encrypted},${check.pathname + check.search},${text}) RETURNING id, name, origin, verification_path, verification_text, created_at`;
  if (!Array.isArray(rows) || !rows.length)
    throw new Error("Profile could not be saved");
  return rows[0] as AuthProfile;
}
export async function revokeAuthProfile(
  owner: string,
  id: number,
): Promise<boolean> {
  await ensureSchema();
  const rows =
    await getSql()`UPDATE auth_profiles SET revoked_at = NOW() WHERE id = ${id} AND owner_github_id = ${owner} AND revoked_at IS NULL RETURNING id`;
  return Array.isArray(rows) && rows.length > 0;
}
export async function profileForRun(
  owner: string,
  id: number,
  targetUrl: string,
) {
  await ensureSchema();
  const rows =
    await getSql()`SELECT id, name, origin, encrypted_state, verification_path, verification_text FROM auth_profiles WHERE id = ${id} AND owner_github_id = ${owner} AND revoked_at IS NULL`;
  const p = Array.isArray(rows)
    ? (rows[0] as (AuthProfile & { encrypted_state: string }) | undefined)
    : null;
  if (!p)
    throw new ProfileError(
      "This profile is unavailable. Choose another profile.",
    );
  if (p.origin !== new URL(targetUrl).origin)
    throw new ProfileError(
      `This profile is for ${p.origin}. Create or choose a profile for ${new URL(targetUrl).origin}.`,
    );
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
    FROM runs r JOIN projects p ON p.id = r.project_id LEFT JOIN auth_profiles a ON a.id = r.auth_profile_id AND a.owner_github_id = p.owner_github_id WHERE r.id = ${runId}`;
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
