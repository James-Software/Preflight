import { randomBytes, createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getProject } from "@/lib/schema";
import { DatabaseCheckError } from "@/lib/database-check-config";
import { ProfileError } from "@/lib/auth-profile-state";
import {
  databaseProvider,
  providerOAuthConfig,
  providerEndpoints,
  providerProjects,
  providerBranches,
  providerDatabases,
  providerConnectionString,
} from "@/lib/database-provider-api";
import {
  providerAccountConnected,
  providerAccessToken,
  saveProviderAccount,
  disconnectProviderAccount,
  sealProvider,
} from "@/lib/database-provider-accounts";
import {
  saveProjectDatabase,
  listProjectDatabases,
  projectDatabaseSettings,
} from "@/lib/database-connections";
export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ provider: string }> };
const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};
function fail(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof DatabaseCheckError || error instanceof ProfileError
          ? error.message
          : "Could not connect to the provider. Try again.",
    },
    { status: 400, headers },
  );
}
export async function GET(req: NextRequest, context: Context) {
  const owner = (await auth())?.user?.githubId;
  if (!owner)
    return NextResponse.json(
      { error: "Sign in again." },
      { status: 401, headers },
    );
  try {
    const provider = databaseProvider((await context.params).provider);
    const projectId = Number(req.nextUrl.searchParams.get("projectId"));
    if (
      !Number.isSafeInteger(projectId) ||
      projectId <= 0 ||
      !(await getProject(projectId, owner))
    )
      return NextResponse.json(
        { error: "Project unavailable." },
        { status: 404, headers },
      );
    const action = req.nextUrl.searchParams.get("action");
    if (!action)
      return NextResponse.json(
        {
          connected: await providerAccountConnected(owner, provider),
          oauth: !!providerOAuthConfig(provider),
        },
        { headers },
      );
    const token = await providerAccessToken(owner, provider);
    if (action === "projects")
      return NextResponse.json(
        { projects: await providerProjects(provider, token) },
        { headers },
      );
    const project = req.nextUrl.searchParams.get("project") || "";
    if (
      provider !== "neon" ||
      !(await providerProjects(provider, token)).some((p) => p.id === project)
    )
      throw new DatabaseCheckError("Choose a project from this account.");
    if (action === "branches")
      return NextResponse.json(
        { branches: await providerBranches(token, project) },
        { headers },
      );
    const branch = req.nextUrl.searchParams.get("branch") || "";
    if (
      action === "databases" &&
      (await providerBranches(token, project)).some((b) => b.id === branch)
    )
      return NextResponse.json(
        await providerDatabases(token, project, branch),
        { headers },
      );
    throw new DatabaseCheckError("Choose a valid database selection.");
  } catch (error) {
    return fail(error);
  }
}
export async function POST(req: NextRequest, context: Context) {
  if (req.headers.get("origin") !== req.nextUrl.origin)
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403, headers },
    );
  const owner = (await auth())?.user?.githubId;
  if (!owner)
    return NextResponse.json(
      { error: "Sign in again." },
      { status: 401, headers },
    );
  try {
    const provider = databaseProvider((await context.params).provider);
    const raw = await req.text();
    if (raw.length > 24_000)
      throw new DatabaseCheckError("Provider settings are too large.");
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      throw new DatabaseCheckError("Use valid provider settings.");
    }
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new DatabaseCheckError("Complete the provider settings.");
    const projectId = input.projectId;
    if (
      !Number.isSafeInteger(projectId) ||
      projectId <= 0 ||
      !(await getProject(projectId, owner))
    )
      return NextResponse.json(
        { error: "Project unavailable." },
        { status: 404, headers },
      );
    if (input.action === "authorize") {
      const config = providerOAuthConfig(provider);
      if (!config)
        throw new DatabaseCheckError(
          "Account sign-in is not configured. Use an access token instead.",
        );
      const state = randomBytes(32).toString("base64url"),
        verifier = randomBytes(32).toString("base64url");
      const redirectUri = new URL(
        `/api/database-providers/${provider}/callback`,
        req.url,
      ).href;
      const url = new URL(providerEndpoints[provider].authorize);
      url.search = new URLSearchParams({
        client_id: config.clientId,
        response_type: "code",
        redirect_uri: redirectUri,
        state,
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
        code_challenge_method: "S256",
        ...(provider === "neon"
          ? {
              scope:
                "openid offline offline_access urn:neoncloud:projects:read",
            }
          : {}),
      }).toString();
      const response = NextResponse.json({ url: url.href }, { headers });
      response.cookies.set(
        `database-oauth-${provider}`,
        sealProvider(
          {
            state,
            verifier,
            projectId,
            redirectUri,
            expiresAt: Date.now() + 600_000,
          },
          owner,
          provider,
          "oauth",
        ),
        {
          httpOnly: true,
          secure: req.nextUrl.protocol === "https:",
          sameSite: "lax",
          path: `/api/database-providers/${provider}`,
          maxAge: 600,
        },
      );
      return response;
    }
    if (input.action === "token") {
      if (
        typeof input.token !== "string" ||
        !input.token.trim() ||
        input.token.length > 16_000 ||
        /[\r\n]/.test(input.token)
      )
        throw new DatabaseCheckError("Enter a valid provider access token.");
      // Validate before replacing a working account. No secrets are sent back.
      const projects = await providerProjects(provider, input.token.trim());
      await saveProviderAccount(owner, provider, {
        accessToken: input.token.trim(),
      });
      return NextResponse.json({ connected: true, projects }, { headers });
    }
    if (input.action === "disconnect") {
      await disconnectProviderAccount(owner, provider);
      return NextResponse.json({ connected: false }, { headers });
    }
    if (input.action === "select") {
      for (const key of ["origin", "project"])
        if (
          typeof input[key] !== "string" ||
          !input[key] ||
          input[key].length > 2048
        )
          throw new DatabaseCheckError(
            "Choose an app origin and provider project.",
          );
      for (const key of ["branch", "database", "role", "password"])
        if (
          input[key] !== undefined &&
          (typeof input[key] !== "string" || input[key].length > 4096)
        )
          throw new DatabaseCheckError("Use valid database selections.");
      const token = await providerAccessToken(owner, provider);
      const connectionString = await providerConnectionString(
        provider,
        token,
        input,
      );
      const existing = (await listProjectDatabases(projectId, owner)).find(
        (c) => c.origin === new URL(input.origin).origin,
      );
      // No encrypted settings need recovering when no custom checks exist.
      // This lets a fresh provider selection replace a stale encrypted URI.
      const checks =
        existing && existing.check_count > 0
          ? (await projectDatabaseSettings(projectId, owner, existing.id))
              .checks
          : [];
      const connection = await saveProjectDatabase(projectId, owner, {
        origin: input.origin,
        connectionString,
        checks,
      });
      revalidatePath(`/dashboard/projects/${projectId}/database`);
      return NextResponse.json({ connection }, { headers });
    }
    throw new DatabaseCheckError("Choose a valid provider action.");
  } catch (error) {
    return fail(error);
  }
}
