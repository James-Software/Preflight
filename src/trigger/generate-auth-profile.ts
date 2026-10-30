import { task } from "@trigger.dev/sdk";
import { getSql } from "@/lib/db";
import { getProject } from "@/lib/schema";
import { profileProject } from "@/lib/auth-profiles";
import {
  encryptProfile,
  decryptProfile,
  ProfileError,
  parseProfileState,
} from "@/lib/auth-profile-state";
import { generationToken, openTestAccount } from "@/lib/profile-generation";
import { openFixGithubGrant } from "@/lib/fix-github-grant";
import { profileProvisioningDatabase } from "@/lib/database-connections";
import { postgresClient } from "@/lib/postgres-verification";
import { DatabaseCheckError } from "@/lib/database-check-config";
import { signTestUserRequest } from "@/lib/test-user-issuer";
import { SITE_URL } from "@/lib/site";
import { publicHttpRequest, decodedPublicBody } from "@/lib/public-http";
import {
  ProvisioningError,
  inspectAuthSource,
  detectProvisioning,
  inspectAuthTables,
  provisionDatabaseSession,
  provisionSupabase,
} from "@/lib/profile-provisioning";

export const generateAuthProfile = task({
  id: "generate-auth-profile",
  maxDuration: 540,
  retry: { maxAttempts: 1 },
  run: async (payload: {
    owner: string;
    projectId: number;
    captureId: string;
  }) => {
    await profileProject(payload.owner, payload.projectId);
    const sql = getSql(),
      token = generationToken();
    const rows =
      await sql`UPDATE profile_captures SET automation_status='running',automation_message='Inspecting authentication code and database…',automation_token=${token}::uuid WHERE id=${payload.captureId}::uuid AND owner_github_id=${payload.owner} AND project_id=${payload.projectId} AND status='active' AND automation_status='queued' AND expires_at>NOW() RETURNING *`;
    const capture = (rows as any[])[0];
    if (!capture) return { status: "unavailable" };
    let client: Awaited<ReturnType<typeof postgresClient>> | undefined;
    async function active() {
      const r =
        await sql`SELECT id FROM profile_captures WHERE id=${capture.id}::uuid AND owner_github_id=${payload.owner} AND project_id=${payload.projectId} AND automation_token=${token}::uuid AND status='active' AND expires_at>NOW()`;
      if (!(r as any[]).length)
        throw new ProvisioningError("Setup cancelled or expired.");
    }
    try {
      const project = await getProject(payload.projectId, payload.owner);
      if (!project || !capture.automation_github_grant)
        throw new ProvisioningError(
          "Reconnect GitHub and start a new profile so PreFlight can inspect the authentication implementation.",
        );
      const github = openFixGithubGrant(
        capture.automation_github_grant,
        `profile:${capture.id}`,
        payload.owner,
      );
      const source = await inspectAuthSource(github, project.repo_full_name),
        plan = detectProvisioning(source);
      const connection = await profileProvisioningDatabase(
        payload.owner,
        payload.projectId,
        capture.origin,
      );
      client = await postgresClient(connection);
      await client.query(
        "SET application_name='PreFlight test-user provisioning'",
      );
      const account = openTestAccount(
        capture.automation_credentials,
        payload.owner,
        capture.origin,
        capture.id,
      );
      await active();
      if (
        (await profileProvisioningDatabase(
          payload.owner,
          payload.projectId,
          capture.origin,
        )) !== connection
      )
        throw new ProvisioningError(
          "The database connection changed during setup. Generate a new profile using the current connection.",
        );
      await sql`UPDATE profile_captures SET automation_message='Provisioning a dedicated test user and issuing its authentication tokens…' WHERE id=${capture.id}::uuid AND automation_token=${token}::uuid AND status='active'`;
      if (plan.kind === "preflight") {
        if (capture.origin !== SITE_URL)
          throw new ProvisioningError(
            "This issuer is scoped to PreFlight itself. Other JWT applications need their own trusted issuer.",
          );
        // Read a server-only challenge from the selected DB, never send its
        // expected value to a customer-controlled database.
        const probe = await client.query({
          text: "SELECT automation_token::text AS token FROM profile_captures WHERE id=$1 AND owner_github_id=$2 AND project_id=$3",
          values: [capture.id, payload.owner, payload.projectId],
        });
        if (probe.rows[0]?.token !== token)
          throw new ProvisioningError(
            "The connected database is not this PreFlight instance's database. Select the database used by this app before provisioning a test identity.",
          );
      }
      let state = capture.automation_auth_state
        ? decryptProfile(
            capture.automation_auth_state,
            payload.owner,
            capture.origin,
          )
        : null;
      if (!state) {
        if (plan.kind === "preflight") {
          const body = JSON.stringify({
            captureId: capture.id,
            owner: payload.owner,
            projectId: payload.projectId,
            workToken: token,
            timestamp: Date.now(),
          });
          const response = await fetch(
            new URL("/api/profiles/issue", SITE_URL),
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-preflight-issuer-signature": signTestUserRequest(body),
              },
              body,
              redirect: "error",
              signal: AbortSignal.timeout(15000),
              cache: "no-store",
            },
          );
          const result = await response.json().catch(() => null);
          if (!response.ok || !result?.state?.cookies?.length)
            throw new ProvisioningError(
              "PreFlight's test-user issuer could not authorize this setup. Wait for the web and Trigger deployments, confirm their shared encryption key matches, and retry.",
            );
          state = parseProfileState(
            capture.origin,
            JSON.stringify(result.state),
            "{}",
          );
        } else if (plan.kind === "authjs") {
          await inspectAuthTables(client, plan);
          await active();
          state = await provisionDatabaseSession(
            client,
            plan,
            account,
            capture.id,
            payload.owner,
            capture.origin,
          );
        } else {
          await active();
          state = (
            await provisionSupabase(
              payload.owner,
              connection,
              account,
              capture.id,
              plan.ssr,
              capture.origin,
            )
          ).state;
        }
        const encrypted = encryptProfile(state, payload.owner, capture.origin);
        await sql`UPDATE profile_captures SET automation_auth_state=${encrypted} WHERE id=${capture.id}::uuid AND automation_token=${token}::uuid AND status='active'`;
      }
      await active();
      if (plan.kind === "authjs" || plan.kind === "preflight") {
        const response = await publicHttpRequest(
          new URL("/api/auth/session", capture.origin),
          {
            headers: {
              Cookie: state.cookies
                .map((c) => `${c.name}=${c.value}`)
                .join("; "),
            },
            signal: AbortSignal.timeout(15000),
            maxBytes: 65536,
          },
        );
        let result;
        try { result = JSON.parse(decodedPublicBody(response, 65536).toString("utf8")); } catch { result = null; }
        if (response.status !== 200 || result?.user?.email !== account.email)
          throw new ProvisioningError(
            "The app did not accept the database-issued session. The marked test user remains available; check session callbacks and the selected database.",
          );
      } else {
        const storage = JSON.parse(state.origins[0].localStorage[0].value);
        const result = await client.query({
          text: "SELECT id FROM auth.users WHERE id=$1 AND email=$2",
          values: [storage.user.id, account.email],
        });
        if (result.rows.length !== 1)
          throw new ProvisioningError(
            "The provisioned Supabase identity was not found in the connected database.",
          );
      }
      await active();
      const encrypted = encryptProfile(state, payload.owner, capture.origin);
      // Verify the issued token above, but start PreFlight agents in its
      // protected UI rather than leaving them on the session JSON endpoint.
      const verificationPath =
        plan.kind === "preflight"
          ? "/dashboard"
          : plan.kind === "authjs"
            ? "/api/auth/session"
            : "/";
      const verificationText = plan.kind === "authjs" ? account.email : null;
      const saved =
        await sql`WITH capture_grant AS (UPDATE profile_captures SET status='completed',automation_credentials=NULL,automation_auth_state=NULL,automation_github_grant=NULL,automation_live_url=NULL WHERE id=${capture.id}::uuid AND owner_github_id=${payload.owner} AND project_id=${payload.projectId} AND automation_token=${token}::uuid AND status='active' AND expires_at>NOW() RETURNING *), saved_profile AS (INSERT INTO auth_profiles(owner_github_id,name,origin,encrypted_state,verification_path,verification_text,project_id,source_capture_id) SELECT owner_github_id,name,origin,${encrypted},${verificationPath},${verificationText},project_id,id FROM capture_grant RETURNING id,source_capture_id), persistent_identity AS (UPDATE test_users SET expires_at=NULL WHERE capture_id IN (SELECT source_capture_id FROM saved_profile) AND owner_github_id=${payload.owner} AND project_id=${payload.projectId} AND revoked_at IS NULL RETURNING id) SELECT id FROM saved_profile`;
      if (!(saved as any[]).length)
        throw new ProvisioningError(
          "Setup was cancelled before the profile could be saved. The marked test user was not deleted.",
        );
      return { status: "completed" };
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "";
      const message =
        error instanceof ProvisioningError ||
        error instanceof ProfileError ||
        error instanceof DatabaseCheckError
          ? error.message.slice(0, 650)
          : code === "42501" || code === "25006"
            ? "Use a writable database endpoint and a role with SELECT and INSERT on the authentication user/session tables. Read-only verification permissions cannot provision users."
            : "Could not provision the test user. Check database and auth-provider permissions. Existing users were not edited; new test identities are marked by their setup ID.";
      await sql`UPDATE profile_captures SET status='error',automation_message=${message},automation_credentials=NULL,automation_github_grant=NULL,automation_live_url=NULL WHERE id=${capture.id}::uuid AND automation_token=${token}::uuid AND status='active'`;
      return { status: "error" };
    } finally {
      await client?.end().catch(() => {});
    }
  },
});
