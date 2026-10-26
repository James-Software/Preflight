import { createHmac } from "node:crypto";
import type { Client } from "pg";
import { fetchGithub, type GithubContext } from "@/lib/github";
import { profileKey, type ProfileState } from "@/lib/auth-profile-state";
import { providerAccessToken } from "@/lib/database-provider-accounts";
import { providerRequest } from "@/lib/database-provider-api";

export class ProvisioningError extends Error {}

export type AuthSource = { files: Record<string, string>; sha: string };
export async function inspectAuthSource(
  ctx: GithubContext,
  repo: string,
): Promise<AuthSource> {
  if (
    !/^[\w.-]+\/[\w.-]+$/.test(repo) ||
    repo.split("/")[0].toLowerCase() !== ctx.login.toLowerCase()
  )
    throw new ProvisioningError(
      "Reconnect the GitHub owner of this repository.",
    );
  const get = async (path: string) => {
    const response = await fetchGithub(
      ctx,
      `https://api.github.com/repos/${repo}${path}`,
      {
        headers: {
          Authorization: `Bearer ${ctx.accessToken}`,
          Accept: "application/vnd.github+json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok)
      throw new ProvisioningError(
        "Could not inspect authentication code. Reconnect GitHub and retry.",
      );
    return response.json();
  };
  const metadata = await get(""),
    ref = await get(
      `/git/ref/heads/${encodeURIComponent(metadata.default_branch)}`,
    ),
    sha = ref.object.sha;
  const tree = await get(`/git/trees/${sha}?recursive=1`);
  if (tree.truncated)
    throw new ProvisioningError(
      "Repository is too large for automatic authentication inspection.",
    );
  const paths = tree.tree
    .filter(
      (n: any) =>
        n.type === "blob" &&
        ["100644", "100755"].includes(n.mode) &&
        n.size < 40000 &&
        !/(^|\/)(\.env[^/]*|node_modules|\.git|\.github|vendor|dist|build|fixtures|tests|__tests__|public)(\/|$)|secret|credential|private.key/i.test(
          n.path,
        ) &&
        (/(?:^|\/)(?:auth(?:\.config)?\.[cm]?[jt]s|schema\.prisma|package\.json)$/.test(
          n.path,
        ) ||
          /(?:auth|supabase|session).+\.[cm]?[jt]sx?$/.test(n.path)),
    )
    .map((n: any) => n.path)
    .sort(
      (a: string, b: string) =>
        (/schema\.prisma|package\.json/.test(b) ? 1 : 0) -
        (/schema\.prisma|package\.json/.test(a) ? 1 : 0),
    );
  const files: Record<string, string> = {};
  let total = 0;
  for (const path of paths.slice(0, 30)) {
    const file = await get(
      `/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${sha}`,
    );
    if (file.type !== "file" || file.encoding !== "base64" || file.size > 40000)
      continue;
    const text = Buffer.from(file.content, "base64").toString("utf8");
    total += Buffer.byteLength(text);
    if (total > 300000) break;
    files[path] = text;
  }
  return { files, sha };
}
const ident = (value: string) => {
  if (!/^[A-Za-z_]\w*$/.test(value))
    throw new ProvisioningError(
      "Custom auth schema identifiers need a provisioning integration.",
    );
  return `"${value}"`;
};
export type PrismaAuth = {
  kind: "authjs";
  user: string;
  session: string;
  userFields: Record<string, string>;
  sessionFields: Record<string, string>;
  cookie: string;
};
export function detectProvisioning(
  source: AuthSource,
): PrismaAuth | { kind: "supabase"; ssr: boolean } | { kind: "preflight" } {
  const code = Object.entries(source.files)
    .filter(
      ([path]) => !path.endsWith("package.json") && !path.endsWith(".prisma"),
    )
    .map(([, s]) => s)
    .join("\n");
  const packages = Object.entries(source.files)
    .filter(([p]) => p.endsWith("package.json"))
    .map(([, s]) => s)
    .join("\n");
  if (/\bvalidateTestUserSession\b/.test(code) && /NextAuth\s*\(/.test(code))
    return { kind: "preflight" };
  if (
    /(?:createBrowserClient|createServerClient|createClient)\s*\(/.test(code) &&
    /@supabase\/(?:ssr|supabase-js)/.test(code) &&
    /\.auth\.(?:getUser|getSession|signInWithPassword|onAuthStateChange)/.test(
      code,
    )
  ) {
    if (/PrismaAdapter\s*\(/.test(code))
      throw new ProvisioningError(
        "Multiple authentication systems were found. Add an app-side provisioning integration to select the correct issuer.",
      );
    if (/storageKey\s*:|cookieOptions\s*:\s*\{[^}]*\bname\s*:/.test(code))
      throw new ProvisioningError(
        "Custom Supabase token storage needs an app-side provisioning integration.",
      );
    return { kind: "supabase", ssr: /@supabase\/ssr/.test(code) };
  }
  if (
    /strategy\s*:\s*['"]jwt['"]/.test(code) ||
    !/PrismaAdapter\s*\(/.test(code)
  )
    throw new ProvisioningError(
      "This authentication implementation is not supported for direct database provisioning. For signed JWT or provider-owned identities, a database row alone cannot produce a valid signed token. Connect the auth provider or add a trusted app-side test-user issuer. No browser sign-up was started.",
    );
  if (/(?:cookies|basePath)\s*:/.test(code))
    throw new ProvisioningError(
      "Custom authentication cookies need an app-side provisioning integration.",
    );
  const prisma = Object.entries(source.files)
    .filter(([p]) => p.endsWith(".prisma"))
    .map(([, s]) => s)
    .join("\n");
  const model = (name: string, required: string[]) => {
    const body = new RegExp(`model\\s+${name}\\s*\\{([\\s\\S]*?)\\}`).exec(
      prisma,
    )?.[1];
    if (!body)
      throw new ProvisioningError(
        "Could not match the authentication models in code.",
      );
    if (/@@schema\(\s*"(?!public")/.test(body))
      throw new ProvisioningError(
        "Custom authentication schemas need an app-side provisioning integration.",
      );
    const table = /@@map\(\s*"(\w+)"\s*\)/.exec(body)?.[1] || name;
    ident(table);
    const fields: Record<string, string> = {};
    for (const field of required) {
      const line = new RegExp(`^\\s*${field}\\s+([^\\n]+)`, "m").exec(
        body,
      )?.[1];
      if (!line)
        throw new ProvisioningError("Unsupported authentication model fields.");
      fields[field] = /@map\(\s*"(\w+)"\s*\)/.exec(line)?.[1] || field;
      ident(fields[field]);
    }
    return { table, fields };
  };
  const user = model("User", ["id", "email", "name", "emailVerified"]),
    session = model("Session", ["id", "sessionToken", "userId", "expires"]);
  return {
    kind: "authjs",
    user: user.table,
    session: session.table,
    userFields: user.fields,
    sessionFields: session.fields,
    cookie: /"next-auth"\s*:\s*"[~^]?4\./.test(packages)
      ? "__Secure-next-auth.session-token"
      : "__Secure-authjs.session-token",
  };
}
export async function inspectAuthTables(client: Client, plan: PrismaAuth) {
  const { rows } = await client.query({
    text: `SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[])`,
    values: [[plan.user, plan.session]],
  });
  for (const [table, fields] of [
    [plan.user, plan.userFields],
    [plan.session, plan.sessionFields],
  ] as const) {
    const cols = rows.filter((r) => r.table_name === table);
    if (
      Object.values(fields).some((f) => !cols.some((c) => c.column_name === f))
    )
      throw new ProvisioningError(
        "Connected database does not match the authentication schema in code.",
      );
    for (const c of cols) {
      if (
        !Object.values(fields).includes(c.column_name) &&
        c.is_nullable === "NO" &&
        c.column_default === null
      )
        throw new ProvisioningError(
          "The user schema has required custom fields. Add an app-side provisioning integration.",
        );
      if (/role|admin|permission|tenant|organization/i.test(c.column_name))
        throw new ProvisioningError(
          "Custom roles or tenant membership require an app-side provisioning integration.",
        );
    }
    const id = cols.find((c) => c.column_name === fields.id);
    if (!["uuid", "text", "character varying"].includes(id?.data_type))
      throw new ProvisioningError(
        "Only UUID/text authentication IDs are supported automatically.",
      );
  }
  const unsafe = await client.query({
    text: `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND (c.relkind<>'r' OR c.relrowsecurity OR EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal) OR EXISTS(SELECT 1 FROM pg_rewrite r WHERE r.ev_class=c.oid))`,
    values: [[plan.user, plan.session]],
  });
  if (unsafe.rows.length)
    throw new ProvisioningError(
      "Auth tables with custom triggers, rules or row policies need their auth provider’s provisioning API.",
    );
}
export async function provisionDatabaseSession(
  client: Client,
  plan: PrismaAuth,
  account: { email: string; name: string },
  captureId: string,
  owner: string,
  origin: string,
): Promise<ProfileState> {
  const token = createHmac("sha256", profileKey())
    .update(`preflight:test-session:${owner}:${origin}:${captureId}`)
    .digest("base64url");
  const expires = new Date(Date.now() + 86400000),
    u = plan.userFields,
    s = plan.sessionFields;
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL statement_timeout='5s'");
    await client.query("SET LOCAL lock_timeout='2s'");
    await client.query(
      `LOCK TABLE public.${ident(plan.user)},public.${ident(plan.session)} IN SHARE ROW EXCLUSIVE MODE`,
    );
    await inspectAuthTables(client, plan);
    await client.query({
      text: `INSERT INTO public.${ident(plan.user)}(${[u.id, u.email, u.name, u.emailVerified].map(ident).join(",")}) VALUES($1,$2,$3,NOW()) ON CONFLICT (${ident(u.id)}) DO NOTHING`,
      values: [captureId, account.email, account.name],
    });
    const user = await client.query({
      text: `SELECT ${ident(u.email)} AS email FROM public.${ident(plan.user)} WHERE ${ident(u.id)}=$1`,
      values: [captureId],
    });
    if (user.rows.length !== 1 || user.rows[0].email !== account.email)
      throw new ProvisioningError(
        "The test identity conflicts with an existing user. Nothing was changed.",
      );
    await client.query({
      text: `INSERT INTO public.${ident(plan.session)}(${[s.id, s.sessionToken, s.userId, s.expires].map(ident).join(",")}) VALUES($1,$2,$3,$4) ON CONFLICT (${ident(s.sessionToken)}) DO NOTHING`,
      values: [captureId, token, captureId, expires],
    });
    const session = await client.query({
      text: `SELECT ${ident(s.userId)} AS uid FROM public.${ident(plan.session)} WHERE ${ident(s.sessionToken)}=$1`,
      values: [token],
    });
    if (session.rows.length !== 1 || session.rows[0].uid !== captureId)
      throw new ProvisioningError("Test session conflicts with existing data.");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
  return {
    cookies: [
      {
        name: plan.cookie,
        value: token,
        domain: new URL(origin).hostname,
        path: "/",
        expires: expires.getTime() / 1000,
        secure: true,
        httpOnly: true,
        sameSite: "Lax",
      },
    ],
    origins: [],
    headers: {},
  };
}
export async function provisionSupabase(
  owner: string,
  connectionString: string,
  account: { email: string; password: string; name: string },
  captureId: string,
  ssr: boolean,
  origin: string,
): Promise<{ state: ProfileState; id: string }> {
  const db = new URL(connectionString),
    ref =
      /^db\.([a-z0-9]+)\.supabase\.co$/.exec(db.hostname)?.[1] ||
      /^postgres\.([a-z0-9]+)$/.exec(decodeURIComponent(db.username))?.[1];
  if (!ref)
    throw new ProvisioningError(
      "The selected database is not a recognized Supabase project.",
    );
  const keys = await providerRequest(
    "supabase",
    await providerAccessToken(owner, "supabase"),
    `/projects/${ref}/api-keys`,
  );
  const key = Array.isArray(keys)
    ? keys.find((k: any) => k.name === "service_role")?.api_key
    : null;
  if (typeof key !== "string")
    throw new ProvisioningError(
      "Supabase account access must allow test-user provisioning for this project.",
    );
  const request = async (path: string, body: unknown) => {
    const r = await fetch(`https://${ref}.supabase.co/auth/v1${path}`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!r.ok)
      throw new ProvisioningError(
        `Supabase could not provision/sign in the test user (HTTP ${r.status}).`,
      );
    return r.json();
  };
  const user = await request("/admin/users", {
    email: account.email,
    password: account.password,
    email_confirm: true,
    user_metadata: { name: account.name, preflight_setup_id: captureId },
  });
  const session = await request("/token?grant_type=password", {
    email: account.email,
    password: account.password,
  });
  if (
    session.user?.id !== (user.id || user.user?.id) ||
    typeof session.access_token !== "string" ||
    typeof session.refresh_token !== "string"
  )
    throw new ProvisioningError(
      "Supabase did not return a verified test-user session.",
    );
  // GoTrue can return expires_in without the SDK-derived expires_at field.
  if (
    !Number.isFinite(session.expires_at) ||
    session.expires_at <= Date.now() / 1000
  )
    session.expires_at =
      Math.floor(Date.now() / 1000) +
      (typeof session.expires_in === "number" && session.expires_in > 0
        ? Math.min(session.expires_in, 86400)
        : 3600);
  const storageKey = `sb-${ref}-auth-token`,
    state: ProfileState = {
      cookies: [],
      origins: [
        {
          origin,
          localStorage: [{ name: storageKey, value: JSON.stringify(session) }],
        },
      ],
      headers: {},
    };
  if (ssr) {
    const value =
      "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
    const chunks = Math.ceil(value.length / 3000);
    for (let i = 0; i < chunks; i++)
      state.cookies.push({
        name: storageKey + (chunks > 1 ? `.${i}` : ""),
        value: value.slice(i * 3000, (i + 1) * 3000),
        domain: new URL(origin).hostname,
        path: "/",
        expires: Number(session.expires_at) || Date.now() / 1000 + 3600,
        secure: true,
        httpOnly: false,
        sameSite: "Lax",
      });
  }
  return { state, id: session.user.id };
}
