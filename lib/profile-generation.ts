import { randomBytes, randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";
import { getProject, ensureSchema } from "@/lib/schema";
import { profileProject, type AuthProfile } from "@/lib/auth-profiles";
import {
  encryptProfile,
  decryptProfile,
  ProfileError,
  profileOrigin,
  profileKey,
} from "@/lib/auth-profile-state";

export const generationMessages = {
  queued: "Preparing a private browser…",
  running: "Inspecting authentication code and provisioning a test user…",
  verifying: "Checking the saved session in a fresh browser…",
  email_verification:
    "Open the browser and complete email verification, then continue. A generated @example.com address has no inbox; use your own test inbox if your app requires email verification.",
  captcha: "Complete the CAPTCHA in the browser, then continue.",
  oauth:
    "This app uses an external sign-in provider. Sign in with a test account in the browser, then continue.",
  invite:
    "This app requires an invitation. Complete sign-up in the browser, then continue.",
  no_signup:
    "No self-service sign-up was found. Sign in with a test account in the browser, then continue.",
  unsupported:
    "Complete the remaining sign-up steps in the browser, then continue.",
  failed:
    "Automatic setup paused. Open the browser to finish signing in, then continue.",
};
export type GenerationStatus =
  | "queued"
  | "running"
  | "waiting"
  | "completed"
  | "cancelled"
  | "expired"
  | "error";
export type ProfileGeneration = {
  id: string;
  status: GenerationStatus;
  message: string;
  expiresAt: number;
  liveUrl?: string;
  profile?: AuthProfile;
};
export function testAccount(email?: unknown) {
  const suffix = randomBytes(6).toString("hex");
  const address = typeof email === "string" ? email.trim() : "";
  if (
    address &&
    (address.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))
  )
    throw new ProfileError("Enter a valid test email address.");
  return {
    email: address || `preflight-${suffix}@example.com`,
    password: `Pf!${randomBytes(24).toString("base64url")}9a`,
    name: `PreFlight Test ${suffix.slice(0, 6)}`,
    username: `preflight${suffix}`,
  };
}
export type TestAccount = ReturnType<typeof testAccount>;
function binding(owner: string, id: string) {
  return `${owner}:profile-generation:${id}`;
}
export function sealGenerationLiveUrl(
  url: string,
  owner: string,
  origin: string,
  id: string,
) {
  return encryptProfile(
    {
      cookies: [],
      headers: {},
      origins: [{ origin, localStorage: [{ name: "liveUrl", value: url }] }],
    },
    `${binding(owner, id)}:live`,
    origin,
  );
}
export function openGenerationLiveUrl(
  encrypted: string,
  owner: string,
  origin: string,
  id: string,
) {
  const value = decryptProfile(
    encrypted,
    `${binding(owner, id)}:live`,
    origin,
  ).origins[0]?.localStorage.find((item) => item.name === "liveUrl")?.value;
  const url = new URL(value || "");
  if (
    url.protocol !== "https:" ||
    !(
      url.hostname === "browserbase.com" ||
      url.hostname.endsWith(".browserbase.com")
    ) ||
    url.username ||
    url.password
  )
    throw new ProfileError(
      "Could not restore the private browser link. Cancel setup and try again.",
    );
  return url.href;
}
export function sealTestAccount(
  account: TestAccount,
  owner: string,
  origin: string,
  id: string,
) {
  return encryptProfile(
    {
      cookies: [],
      headers: {},
      origins: [
        {
          origin,
          localStorage: Object.entries(account).map(([name, value]) => ({
            name,
            value,
          })),
        },
      ],
    },
    binding(owner, id),
    origin,
  );
}
export function openTestAccount(
  encrypted: string,
  owner: string,
  origin: string,
  id: string,
): TestAccount {
  const values = Object.fromEntries(
    decryptProfile(
      encrypted,
      binding(owner, id),
      origin,
    ).origins[0].localStorage.map((v) => [v.name, v.value]),
  );
  if (
    !["email", "password", "name", "username"].every(
      (key) => typeof values[key] === "string" && values[key],
    )
  )
    throw new ProfileError(
      "Could not unlock automatic profile setup. Start again.",
    );
  return values as TestAccount;
}
export async function startProfileGeneration(
  owner: string,
  projectId: number,
  input: { origin?: unknown; email?: unknown },
) {
  await profileProject(owner, projectId);
  const project = await getProject(projectId, owner);
  const origin =
    typeof input.origin === "string" && input.origin
      ? input.origin
      : project?.app_url || project?.latest_target_url;
  if (!origin)
    throw new ProfileError(
      "Set this project's app URL before generating a profile.",
    );
  const account = testAccount(input.email);
  const appOrigin = profileOrigin(origin);
  const host = new URL(appOrigin).hostname;
  if (
    !appOrigin.startsWith("https://") ||
    !host.includes(".") ||
    host.endsWith(".localhost") ||
    /^[\d.]+$/.test(host) ||
    host.includes(":")
  )
    throw new ProfileError("Use a public HTTPS app URL.");
  profileKey();
  await ensureSchema();
  const sql = getSql(),
    id = randomUUID();
  await sql`UPDATE profile_captures SET status='expired',automation_credentials=NULL,automation_live_url=NULL,automation_github_grant=NULL,automation_auth_state=NULL WHERE owner_github_id=${owner} AND expires_at<=NOW() AND status IN ('active','saving')`;
  const rows =
    await sql`INSERT INTO profile_captures(id,owner_github_id,name,origin,verification_path,verification_text,project_id,automation_status,automation_message,automation_credentials)
    VALUES(${id},${owner},${account.name},${appOrigin},'/','Automatic setup pending',${projectId},'queued',${generationMessages.queued},${sealTestAccount(account, owner, appOrigin, id)}) ON CONFLICT DO NOTHING RETURNING id,expires_at`;
  const row = (rows as { id: string; expires_at: string }[])[0];
  if (!row)
    throw new ProfileError(
      "A profile setup is already open for this project. Finish or cancel it first.",
    );
  return { id: row.id, expiresAt: new Date(row.expires_at).getTime() };
}
export async function getProfileGeneration(
  owner: string,
  projectId: number,
  id?: string,
): Promise<ProfileGeneration | null> {
  await profileProject(owner, projectId);
  await ensureSchema();
  if (id && !/^[0-9a-f-]{36}$/i.test(id))
    throw new ProfileError("Choose a valid profile setup.");
  const rows =
    await getSql()`SELECT c.id,c.status,c.automation_status,c.automation_message,c.automation_live_url,c.origin AS setup_origin,c.expires_at,(c.session_id IS NOT NULL) AS legacy_browser,
    a.id AS profile_id,a.name,a.origin,a.verification_path,a.verification_text,a.created_at
    FROM profile_captures c LEFT JOIN auth_profiles a ON a.source_capture_id=c.id AND a.owner_github_id=c.owner_github_id AND a.project_id=c.project_id AND a.revoked_at IS NULL
    WHERE c.owner_github_id=${owner} AND c.project_id=${projectId} AND c.automation_status IS NOT NULL
    AND ((${id || null}::uuid IS NOT NULL AND c.id=${id || null}::uuid) OR (${id || null}::uuid IS NULL AND c.status IN ('active','saving') AND c.expires_at>NOW()))
    ORDER BY c.expires_at DESC LIMIT 1`;
  const row = (rows as any[])[0];
  if (!row) return null;
  const expiresAt = new Date(row.expires_at).getTime();
  const status: GenerationStatus =
    row.status === "completed"
      ? "completed"
      : row.status === "cancelled"
        ? "cancelled"
        : expiresAt <= Date.now()
          ? "expired"
          : row.status === "error"
            ? "error"
            : row.automation_status === "waiting"
              ? "waiting"
              : row.automation_status === "queued"
                ? "queued"
                : "running";
  const result: ProfileGeneration = {
    id: row.id,
    status,
    expiresAt,
    message:
      status === "expired"
        ? "Setup expired. Generate a new profile to try again."
        : status === "completed"
          ? "Test account verified. Your profile is ready."
          : row.automation_message || generationMessages.running,
  };
  if (row.legacy_browser && ["queued", "running", "waiting"].includes(status))
    result.message =
      "Cancel this older browser-based setup, then generate a new profile to provision a test user from code and database.";
  if (status === "completed" && row.profile_id)
    result.profile = {
      id: row.profile_id,
      name: row.name,
      origin: row.origin,
      verification_path: row.verification_path,
      verification_text: row.verification_text,
      created_at: row.created_at,
    };
  return result;
}
export async function resumeProfileGeneration(
  owner: string,
  projectId: number,
  id: string,
) {
  await profileProject(owner, projectId);
  if (!/^[0-9a-f-]{36}$/i.test(id))
    throw new ProfileError("Choose a valid profile setup.");
  const rows =
    await getSql()`UPDATE profile_captures SET automation_status='queued',automation_message=${generationMessages.queued},automation_token=NULL,automation_resume=TRUE
    WHERE id=${id}::uuid AND owner_github_id=${owner} AND project_id=${projectId} AND status='active' AND automation_status='waiting' AND expires_at>NOW() RETURNING id`;
  if (!(rows as any[]).length)
    throw new ProfileError(
      "This setup is already running, finished or expired. Refresh its status.",
    );
}
export async function cancelProfileGeneration(
  owner: string,
  projectId: number,
  id: string,
) {
  await profileProject(owner, projectId);
  if (!/^[0-9a-f-]{36}$/i.test(id))
    throw new ProfileError("Choose a valid profile setup.");
  const rows =
    await getSql()`UPDATE profile_captures SET status='cancelled',automation_credentials=NULL,automation_live_url=NULL,automation_github_grant=NULL,automation_auth_state=NULL
    WHERE id=${id}::uuid AND owner_github_id=${owner} AND project_id=${projectId} AND automation_status IS NOT NULL AND status IN ('active','saving') RETURNING id`;
  if (!(rows as any[]).length)
    throw new ProfileError(
      "This setup is already finished or unavailable. Refresh its status.",
    );
}
export async function failGenerationQueue(
  owner: string,
  projectId: number,
  id: string,
) {
  await cancelProfileGeneration(owner, projectId, id).catch(() => {});
}
export function generationToken() {
  return randomUUID();
}
