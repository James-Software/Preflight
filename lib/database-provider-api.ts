import { DatabaseCheckError } from "@/lib/database-check-config";
export type DatabaseProvider = "supabase" | "neon";
export function databaseProvider(value: string): DatabaseProvider {
  if (value !== "supabase" && value !== "neon")
    throw new DatabaseCheckError("Choose Supabase or Neon.");
  return value;
}
export const providerEndpoints = {
  supabase: {
    api: "https://api.supabase.com/v1",
    authorize: "https://api.supabase.com/v1/oauth/authorize",
    token: "https://api.supabase.com/v1/oauth/token",
  },
  neon: {
    api: "https://console.neon.tech/api/v2",
    authorize: "https://oauth2.neon.tech/oauth2/auth",
    token: "https://oauth2.neon.tech/oauth2/token",
  },
};
export type ProviderTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
};
export function providerOAuthConfig(provider: DatabaseProvider) {
  const prefix = provider.toUpperCase();
  const clientId = process.env[`${prefix}_OAUTH_CLIENT_ID`];
  const clientSecret = process.env[`${prefix}_OAUTH_CLIENT_SECRET`];
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}
export async function exchangeProviderTokens(
  provider: DatabaseProvider,
  fields: Record<string, string>,
): Promise<ProviderTokens> {
  const config = providerOAuthConfig(provider);
  if (!config)
    throw new DatabaseCheckError(
      "Account sign-in is not configured. Use an access token or a connection URL instead.",
    );
  const response = await fetch(providerEndpoints[provider].token, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(fields),
    cache: "no-store",
  });
  if (!response.ok)
    throw new DatabaseCheckError(
      "Account authorization expired or was declined. Connect the account again.",
    );
  const data = await response.json();
  if (
    typeof data.access_token !== "string" ||
    !data.access_token ||
    data.access_token.length > 16_000
  )
    throw new DatabaseCheckError(
      "The provider did not return a usable access token.",
    );
  return {
    accessToken: data.access_token,
    ...(typeof data.refresh_token === "string" &&
    data.refresh_token.length <= 16_000
      ? { refreshToken: data.refresh_token }
      : {}),
    ...(typeof data.expires_in === "number" && data.expires_in > 0
      ? { expiresAt: Date.now() + data.expires_in * 1000 }
      : {}),
  };
}
export async function providerRequest(
  provider: DatabaseProvider,
  token: string,
  path: string,
) {
  if (!path.startsWith("/") || path.startsWith("//"))
    throw new Error("Invalid provider path");
  const response = await fetch(`${providerEndpoints[provider].api}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 401)
    throw new DatabaseCheckError(
      "Account authorization expired. Reconnect this provider.",
    );
  if (response.status === 403)
    throw new DatabaseCheckError(
      "This account cannot access that resource. Check the integration permissions or choose another database.",
    );
  if (response.status === 429)
    throw new DatabaseCheckError(
      "The provider is rate limiting requests. Try again shortly.",
    );
  if (!response.ok)
    throw new DatabaseCheckError(
      "Could not load database details from the provider. Try again.",
    );
  return response.json();
}
export type ProviderProject = { id: string; name: string };
export type ProviderChoice = { id: string; name: string };
export async function providerProjects(
  provider: DatabaseProvider,
  token: string,
): Promise<ProviderProject[]> {
  if (provider === "supabase") {
    const rows = await providerRequest(provider, token, "/projects");
    if (!Array.isArray(rows))
      throw new DatabaseCheckError("Could not load Supabase projects.");
    return rows
      .filter(
        (p) =>
          typeof (p.ref || p.id) === "string" && typeof p.name === "string",
      )
      .map((p) => ({ id: p.ref || p.id, name: p.name }));
  }
  let cursor = "";
  const projects: ProviderProject[] = [];
  for (let page = 0; page < 20; page++) {
    const data = await providerRequest(
      provider,
      token,
      `/projects?limit=400${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    if (!Array.isArray(data.projects))
      throw new DatabaseCheckError("Could not load Neon projects.");
    projects.push(
      ...data.projects.map((p: any) => ({ id: p.id, name: p.name })),
    );
    const next = data.pagination?.cursor;
    if (!next || next === cursor || data.projects.length < 400) break;
    cursor = next;
  }
  return projects;
}
export async function providerBranches(
  token: string,
  project: string,
): Promise<ProviderChoice[]> {
  const branches: ProviderChoice[] = [];
  let cursor = "";
  for (let page = 0; page < 20; page++) {
    const data = await providerRequest(
      "neon",
      token,
      `/projects/${encodeURIComponent(project)}/branches?limit=400${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    if (!Array.isArray(data.branches))
      throw new DatabaseCheckError("Could not load Neon branches.");
    branches.push(
      ...data.branches.map((b: any) => ({ id: b.id, name: b.name })),
    );
    const next = data.pagination?.next;
    if (!next || next === cursor) break;
    cursor = next;
  }
  return branches;
}
export async function providerDatabases(
  token: string,
  project: string,
  branch: string,
) {
  const path = `/projects/${encodeURIComponent(project)}/branches/${encodeURIComponent(branch)}`;
  const results = await Promise.allSettled([
    providerRequest("neon", token, `${path}/databases`),
    providerRequest("neon", token, `${path}/roles`),
  ]);
  for (const r of results) if (r.status === "rejected") throw r.reason;
  const databases = (results[0] as PromiseFulfilledResult<any>).value.databases;
  const roles = (results[1] as PromiseFulfilledResult<any>).value.roles;
  if (!Array.isArray(databases) || !Array.isArray(roles))
    throw new DatabaseCheckError("Could not load database names and roles.");
  // Provider role responses can include passwords. Return only names.
  return {
    databases: databases.map((d: any) => ({ id: d.name, name: d.name })),
    roles: roles.map((r: any) => ({ id: r.name, name: r.name })),
  };
}
export async function providerConnectionString(
  provider: DatabaseProvider,
  token: string,
  selection: {
    project: string;
    branch?: string;
    database?: string;
    role?: string;
    password?: string;
  },
) {
  if (
    !(await providerProjects(provider, token)).some(
      (p) => p.id === selection.project,
    )
  )
    throw new DatabaseCheckError("Choose a project available to this account.");
  const project = encodeURIComponent(selection.project);
  if (provider === "neon") {
    const { branch, database, role } = selection;
    if (
      !branch ||
      !database ||
      !role ||
      !(await providerBranches(token, selection.project)).some(
        (b) => b.id === branch,
      )
    )
      throw new DatabaseCheckError("Choose a branch, database and role.");
    const options = await providerDatabases(token, selection.project, branch);
    if (
      !options.databases.some((d) => d.id === database) ||
      !options.roles.some((r) => r.id === role)
    )
      throw new DatabaseCheckError(
        "Choose a database and role from the selected branch.",
      );
    const query = new URLSearchParams({
      branch_id: branch,
      database_name: database,
      role_name: role,
      pooled: "true",
    });
    const data = await providerRequest(
      provider,
      token,
      `/projects/${project}/connection_uri?${query}`,
    );
    if (typeof data.uri !== "string")
      throw new DatabaseCheckError(
        "Neon did not return a connection URL for this role.",
      );
    const url = new URL(data.uri);
    // Only supported TLS options are retained, never forwarded as arbitrary pg options.
    url.search = "sslmode=verify-full";
    return url.href;
  }
  if (!selection.password || selection.password.length > 4096)
    throw new DatabaseCheckError(
      "Enter this Supabase project's database password. Supabase cannot return existing passwords.",
    );
  const pools = await providerRequest(
    provider,
    token,
    `/projects/${project}/config/database/pooler`,
  );
  if (!Array.isArray(pools))
    throw new DatabaseCheckError(
      "Could not load the Supabase pooler configuration.",
    );
  const pool =
    pools.find(
      (p) => p.database_type === "PRIMARY" && p.pool_mode === "session",
    ) || pools.find((p) => p.database_type === "PRIMARY");
  if (!pool?.db_host || !pool?.db_user || !pool?.db_name || !pool?.db_port)
    throw new DatabaseCheckError(
      "This project's database pooler is unavailable. Enable it in Supabase or use a connection URL.",
    );
  const template = pool.connection_string || pool.connectionString;
  const url =
    typeof template === "string" && template.startsWith("postgres")
      ? new URL(template)
      : new URL(
          "postgresql://placeholder:placeholder@placeholder.invalid/postgres",
        );
  if (!template) {
    url.hostname = pool.db_host;
    url.port = String(pool.db_port);
    url.username = encodeURIComponent(pool.db_user);
    url.pathname = `/${encodeURIComponent(pool.db_name)}`;
  }
  url.password = encodeURIComponent(selection.password);
  url.search = "sslmode=verify-full";
  return url.href;
}
