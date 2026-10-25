const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load-module.cjs");
const config = load("lib/database-check-config.ts", {});
const state = load("lib/auth-profile-state.ts", {});
const api = load("lib/database-provider-api.ts", {
  "@/lib/database-check-config": config,
});
function fetches(t, handler) {
  const old = global.fetch;
  global.fetch = async (url, init) =>
    new Response(JSON.stringify(await handler(new URL(url), init)), {
      status: 200,
    });
  t.after(() => {
    global.fetch = old;
  });
}
function environment(t) {
  const names = [
    "PROFILE_ENCRYPTION_KEY",
    "SUPABASE_OAUTH_CLIENT_ID",
    "SUPABASE_OAUTH_CLIENT_SECRET",
  ];
  const old = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  process.env.PROFILE_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString("base64");
  process.env.SUPABASE_OAUTH_CLIENT_ID = "client";
  process.env.SUPABASE_OAUTH_CLIENT_SECRET = "client-secret";
  t.after(() => {
    for (const n of names)
      if (old[n] === undefined) delete process.env[n];
      else process.env[n] = old[n];
  });
}
function store(extra = {}) {
  return load("lib/database-provider-accounts.ts", {
    "@/lib/db": { getSql: () => async () => [] },
    "@/lib/schema": { ensureSchema: async () => {} },
    "@/lib/auth-profile-state": state,
    "@/lib/database-check-config": config,
    "@/lib/database-provider-api": api,
    ...extra,
  });
}
test("provider secrets are randomized and bound to owner, provider and purpose", (t) => {
  environment(t);
  const accounts = store();
  const tokens = {
    accessToken: "private-provider-token",
    refreshToken: "private-refresh-token",
  };
  const encrypted = accounts.sealProvider(tokens, "100", "supabase");
  assert.notEqual(encrypted, accounts.sealProvider(tokens, "100", "supabase"));
  assert.ok(!encrypted.includes("private-provider-token"));
  assert.deepEqual(
    accounts.unsealProvider(encrypted, "100", "supabase"),
    tokens,
  );
  for (const [owner, provider, purpose] of [
    ["200", "supabase", "account"],
    ["100", "neon", "account"],
    ["100", "supabase", "oauth"],
  ])
    assert.throws(
      () => accounts.unsealProvider(encrypted, owner, provider, purpose),
      /unlock/,
    );
});
test("Supabase autofill uses the provider pooler URI and only asks for the unavailable password", async (t) => {
  fetches(t, async (url, init) => {
    assert.equal(url.origin, "https://api.supabase.com");
    assert.equal(init.redirect, "error");
    assert.equal(init.headers.Authorization, "Bearer account-secret");
    if (url.pathname.endsWith("/projects"))
      return [
        {
          id: "ref",
          ref: "ref",
          name: "App",
          database: { password: "must-never-return" },
        },
      ];
    return [
      {
        database_type: "PRIMARY",
        pool_mode: "session",
        db_user: "postgres",
        db_host: "aws-0-us-east-1.pooler.supabase.com",
        db_port: 5432,
        db_name: "postgres",
        connection_string:
          "postgresql://postgres.ref:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
      },
    ];
  });
  assert.deepEqual(await api.providerProjects("supabase", "account-secret"), [
    { id: "ref", name: "App" },
  ]);
  const uri = new URL(
    await api.providerConnectionString("supabase", "account-secret", {
      project: "ref",
      password: "a:@/?#% word",
    }),
  );
  assert.equal(uri.username, "postgres.ref");
  assert.equal(decodeURIComponent(uri.password), "a:@/?#% word");
  assert.equal(uri.searchParams.get("sslmode"), "verify-full");
  await assert.rejects(
    api.providerConnectionString("supabase", "account-secret", {
      project: "ref",
    }),
    /database password/,
  );
  await assert.rejects(
    api.providerConnectionString("supabase", "account-secret", {
      project: "forged",
      password: "secret",
    }),
    /available to this account/,
  );
});
test("Neon lists names only and validates branch, database and role before retrieving a server-only URI", async (t) => {
  let uris = 0;
  fetches(t, async (url) => {
    assert.equal(url.origin, "https://console.neon.tech");
    if (url.pathname.endsWith("/projects"))
      return { projects: [{ id: "project", name: "App" }] };
    if (url.pathname.endsWith("/branches"))
      return { branches: [{ id: "branch", name: "staging" }] };
    if (url.pathname.endsWith("/databases"))
      return { databases: [{ name: "neondb", owner_name: "owner" }] };
    if (url.pathname.endsWith("/roles"))
      return { roles: [{ name: "reader", password: "private-role-password" }] };
    uris++;
    assert.equal(url.searchParams.get("role_name"), "reader");
    return {
      uri: "postgresql://reader:private-role-password@ep-one.neon.tech/neondb?sslmode=require&options=bad",
    };
  });
  assert.deepEqual(await api.providerDatabases("secret", "project", "branch"), {
    databases: [{ id: "neondb", name: "neondb" }],
    roles: [{ id: "reader", name: "reader" }],
  });
  const selection = {
    project: "project",
    branch: "branch",
    database: "neondb",
    role: "reader",
  };
  for (const patch of [
    { project: "foreign" },
    { branch: "foreign" },
    { database: "foreign" },
    { role: "foreign" },
  ])
    await assert.rejects(
      api.providerConnectionString("neon", "secret", {
        ...selection,
        ...patch,
      }),
    );
  assert.equal(uris, 0);
  const uri = new URL(
    await api.providerConnectionString("neon", "secret", selection),
  );
  assert.equal(uris, 1);
  assert.equal(uri.search, "?sslmode=verify-full");
});
test("provider errors never expose response bodies or request credentials", async (t) => {
  const old = global.fetch;
  t.after(() => {
    global.fetch = old;
  });
  for (const status of [401, 403, 429, 500]) {
    global.fetch = async () =>
      new Response("private-provider-response", { status });
    await assert.rejects(
      api.providerProjects("supabase", "private-token"),
      (error) => !/private/.test(error.message),
    );
  }
});
test("OAuth code exchange includes PKCE, verified endpoints and client authentication", async (t) => {
  environment(t);
  fetches(t, async (url, init) => {
    assert.equal(url.href, "https://api.supabase.com/v1/oauth/token");
    assert.equal(init.redirect, "error");
    assert.equal(
      init.headers.Authorization,
      `Basic ${Buffer.from("client:client-secret").toString("base64")}`,
    );
    assert.equal(init.body.get("code_verifier"), "verifier");
    return {
      access_token: "access",
      refresh_token: "refresh",
      expires_in: 3600,
    };
  });
  const tokens = await api.exchangeProviderTokens("supabase", {
    grant_type: "authorization_code",
    code: "code",
    code_verifier: "verifier",
  });
  assert.equal(tokens.accessToken, "access");
  assert.equal(tokens.refreshToken, "refresh");
  assert.ok(tokens.expiresAt > Date.now());
});
test("provider API gates owner and origin before contacting a provider; OAuth state is encrypted and cookie-bound", async (t) => {
  environment(t);
  const { NextRequest } = require("next/server");
  const accounts = store();
  let owner = null,
    owns = true,
    providerCalls = 0;
  const route = load("app/api/database-providers/[provider]/route.ts", {
    "@/auth": {
      auth: async () => (owner ? { user: { githubId: owner } } : null),
    },
    "@/lib/schema": { getProject: async () => (owns ? { id: 1 } : null) },
    "@/lib/database-check-config": config,
    "@/lib/auth-profile-state": state,
    "@/lib/database-provider-api": {
      ...api,
      providerProjects: async () => {
        providerCalls++;
        return [];
      },
    },
    "@/lib/database-provider-accounts": accounts,
    "@/lib/database-connections": {},
    "next/cache": { revalidatePath: () => {} },
  });
  const context = { params: Promise.resolve({ provider: "supabase" }) };
  const req = (origin, action = "authorize") =>
    new NextRequest("https://preflight.test/api/database-providers/supabase", {
      method: "POST",
      headers: { origin },
      body: JSON.stringify({ action, projectId: 1, token: "secret" }),
    });
  assert.equal(
    (await route.POST(req("https://foreign.test"), context)).status,
    403,
  );
  assert.equal(
    (await route.POST(req("https://preflight.test"), context)).status,
    401,
  );
  owner = "100";
  owns = false;
  assert.equal(
    (await route.POST(req("https://preflight.test", "token"), context)).status,
    404,
  );
  assert.equal(providerCalls, 0);
  owns = true;
  const response = await route.POST(req("https://preflight.test"), context),
    data = await response.json();
  const url = new URL(data.url),
    cookie = response.cookies.get("database-oauth-supabase");
  assert.equal(url.origin, "https://api.supabase.com");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.ok(!data.url.includes("client-secret"));
  const flow = accounts.unsealProvider(
    cookie.value,
    "100",
    "supabase",
    "oauth",
  );
  assert.equal(flow.state, url.searchParams.get("state"));
  assert.ok(response.headers.get("set-cookie").includes("HttpOnly"));
  assert.ok(response.headers.get("set-cookie").includes("Secure"));
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("OAuth callback rejects wrong state, expired grants and switched owners; consumes valid callbacks without leaking codes", async (t) => {
  environment(t);
  const { NextRequest } = require("next/server"),
    accounts = store();
  let owner = "100",
    exchanges = 0,
    saved = 0;
  const route = load(
    "app/api/database-providers/[provider]/callback/route.ts",
    {
      "@/auth": { auth: async () => ({ user: { githubId: owner } }) },
      "@/lib/schema": { getProject: async () => ({ id: 1 }) },
      "@/lib/database-provider-api": {
        ...api,
        exchangeProviderTokens: async () => {
          exchanges++;
          return { accessToken: "access-secret" };
        },
      },
      "@/lib/database-provider-accounts": {
        ...accounts,
        saveProviderAccount: async () => {
          saved++;
        },
      },
    },
  );
  const context = { params: Promise.resolve({ provider: "supabase" }) };
  const flow = {
    state: "expected",
    verifier: "verifier",
    projectId: 1,
    redirectUri:
      "https://preflight.test/api/database-providers/supabase/callback",
    expiresAt: Date.now() + 600000,
  };
  const request = (incoming, overrides = {}) =>
    new NextRequest(
      `https://preflight.test/api/database-providers/supabase/callback?state=${incoming}&code=private-code`,
      {
        headers: {
          cookie: `database-oauth-supabase=${accounts.sealProvider({ ...flow, ...overrides }, "100", "supabase", "oauth")}`,
        },
      },
    );
  for (const req of [request("bad"), request("expected", { expiresAt: 1 })])
    assert.ok(
      (await route.GET(req, context)).headers
        .get("location")
        .includes("databaseProviderError"),
    );
  owner = "200";
  await route.GET(request("expected"), context);
  assert.equal(exchanges, 0);
  owner = "100";
  const response = await route.GET(request("expected"), context);
  assert.equal(exchanges, 1);
  assert.equal(saved, 1);
  assert.equal(
    response.headers.get("location"),
    "https://preflight.test/dashboard/projects/1/database?databaseProvider=supabase#database-settings",
  );
  assert.ok(!response.headers.get("location").includes("private-code"));
  assert.equal(response.cookies.get("database-oauth-supabase").value, "");
});

test("Neon personal API keys discover organizations before retrying scoped project listing", async (t) => {
  const original = global.fetch;
  t.after(() => {
    global.fetch = original;
  });
  const calls = [];
  global.fetch = async (raw, init) => {
    const url = new URL(raw);
    calls.push(url.pathname + url.search);
    assert.equal(init.headers.Authorization, "Bearer personal-secret");
    if (url.pathname.endsWith("/projects") && !url.searchParams.has("org_id"))
      return new Response(
        JSON.stringify({
          code: "BAD_REQUEST",
          message: "org_id is required for personal API keys",
        }),
        { status: 400 },
      );
    if (url.pathname.endsWith("/users/me/organizations"))
      return new Response(
        JSON.stringify({
          organizations: [{ id: "org-first", name: "My team" }],
        }),
      );
    assert.equal(url.searchParams.get("org_id"), "org-first");
    return new Response(
      JSON.stringify({ projects: [{ id: "p1", name: "Storefront" }] }),
    );
  };
  assert.deepEqual(await api.providerProjects("neon", "personal-secret"), [
    { id: "p1", name: "Storefront" },
  ]);
  assert.equal(calls.length, 3);
});
test("Neon personal keys combine organizations, paginate each one and label duplicate project names", async (t) => {
  const original = global.fetch;
  t.after(() => {
    global.fetch = original;
  });
  global.fetch = async (raw) => {
    const url = new URL(raw);
    if (url.pathname.endsWith("/users/me/organizations"))
      return new Response(
        JSON.stringify({
          organizations: [
            { id: "org-a", name: "Team A" },
            { id: "org-b", name: "Team B" },
          ],
        }),
      );
    const org = url.searchParams.get("org_id");
    if (!org)
      return new Response(
        JSON.stringify({ message: "organization id must be specified" }),
        { status: 400 },
      );
    if (org === "org-b")
      return new Response(
        JSON.stringify({ projects: [{ id: "b1", name: "App" }] }),
      );
    if (url.searchParams.has("cursor")) {
      assert.equal(url.searchParams.get("cursor"), "next-page");
      return new Response(
        JSON.stringify({ projects: [{ id: "a2", name: "Worker" }] }),
      );
    }
    return new Response(
      JSON.stringify({
        projects: [{ id: "a1", name: "App" }],
        pagination: { cursor: "next-page" },
      }),
    );
  };
  assert.deepEqual(await api.providerProjects("neon", "secret"), [
    { id: "a1", name: "Team A / App" },
    { id: "a2", name: "Team A / Worker" },
    { id: "b1", name: "Team B / App" },
  ]);
});
test("Neon organization keys continue to work without calling user organization endpoints", async (t) => {
  let calls = 0;
  fetches(t, async (url) => {
    calls++;
    assert.ok(url.pathname.endsWith("/projects"));
    assert.equal(url.searchParams.has("org_id"), false);
    return { projects: [{ id: "p1", name: "App" }] };
  });
  assert.deepEqual(await api.providerProjects("neon", "org-secret"), [
    { id: "p1", name: "App" },
  ]);
  assert.equal(calls, 1);
});
test("unrelated Neon request errors do not trigger organization discovery or leak upstream messages", async (t) => {
  const original = global.fetch;
  t.after(() => {
    global.fetch = original;
  });
  let calls = 0;
  global.fetch = async () => {
    calls++;
    return new Response(
      JSON.stringify({ message: "private-key-or-upstream-details" }),
      { status: 400 },
    );
  };
  await assert.rejects(
    api.providerProjects("neon", "secret"),
    (e) => e.message.includes("HTTP 400") && !e.message.includes("private"),
  );
  assert.equal(calls, 1);
});

test("selecting Neon again replaces a locked zero-check URI without decrypting it, while preserving configured checks", async () => {
  const { NextRequest } = require("next/server");
  for (const count of [0, 1]) {
    let reads = 0,
      saved = 0;
    const route = load("app/api/database-providers/[provider]/route.ts", {
      "@/auth": { auth: async () => ({ user: { githubId: "100" } }) },
      "@/lib/schema": { getProject: async () => ({ id: 7 }) },
      "@/lib/database-check-config": config,
      "@/lib/auth-profile-state": state,
      "@/lib/database-provider-api": {
        ...api,
        providerConnectionString: async () =>
          "postgresql://fresh:private@db.example.com/app",
      },
      "@/lib/database-provider-accounts": {
        providerAccessToken: async () => "private-provider-token",
      },
      "@/lib/database-connections": {
        listProjectDatabases: async () => [
          { id: 9, origin: "https://app.test", check_count: count },
        ],
        projectDatabaseSettings: async () => {
          reads++;
          throw new config.DatabaseConnectionLocked(
            "Could not unlock the database connection.",
          );
        },
        saveProjectDatabase: async (project, owner, input) => {
          saved++;
          assert.equal(project, 7);
          assert.equal(owner, "100");
          assert.deepEqual(input.checks, []);
          return { id: 9, check_count: 0 };
        },
      },
      "next/cache": { revalidatePath: () => {} },
    });
    const response = await route.POST(
      new NextRequest("https://preflight.test/api/database-providers/neon", {
        method: "POST",
        headers: { origin: "https://preflight.test" },
        body: JSON.stringify({
          action: "select",
          projectId: 7,
          origin: "https://app.test",
          project: "neon-project",
          branch: "branch",
          database: "app",
          role: "test",
        }),
      }),
      { params: Promise.resolve({ provider: "neon" }) },
    );
    assert.equal(response.status, count === 0 ? 200 : 400);
    assert.equal(reads, count === 0 ? 0 : 1);
    assert.equal(saved, count === 0 ? 1 : 0);
  }
});
