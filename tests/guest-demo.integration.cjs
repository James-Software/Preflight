require("node:module").registerHooks({ resolve(s, c, next) { return next(s === "next/server" ? s + ".js" : s, c); } });
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { PGlite } = require(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const { NextRequest } = require("next/server");
const { load } = require("./load-module.cjs");

(async () => {
  const jwt = await import("next-auth/jwt");
  process.env.AUTH_SECRET = randomBytes(32).toString("base64url");
  process.env.PROFILE_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.NODE_ENV = "production";
  const db = new PGlite();
  const sql = async (parts, ...values) => { let q = parts[0]; values.forEach((_, i) => { q += `$${i + 1}` + parts[i + 1]; }); return (await db.query(q, values)).rows; };
  const deps = { "@/lib/db": { getSql: () => sql }, "next-auth/jwt": jwt };
  const schema = load("lib/schema.ts", deps);
  deps["@/lib/schema"] = schema;
  const connection = load("lib/database-connections.ts", { ...deps,
    "@/lib/postgres-verification": { parsePostgresUrl: () => {}, postgresReader: async () => ({ read: async () => [{ connected: 1 }], close: async () => {} }) },
  });
  deps["@/lib/database-connections"] = connection;
  const demo = load("lib/guest-demo.ts", deps); deps["@/lib/guest-demo"] = demo;
  const sessions = load("lib/guest-session.ts", deps); deps["@/lib/guest-session"] = sessions;
  const route = load("app/demo/[code]/route.ts", deps);
  const access = load("lib/project-repository-access.ts", deps);
  const agent = load("lib/run-agent-access.ts", deps);
  const code = randomBytes(32).toString("base64url"), hash = demo.demoLinkHash(code);
  const countProjects = async () => (await sql`SELECT count(*)::int AS n FROM projects`)[0].n;
  let cookie = null;
  const normal = { user: { githubId: "demo-owner", name: "Existing user" }, expires: new Date(Date.now()+86400000).toISOString() };
  const authentication = load("auth.ts", { ...deps, "next/headers": { cookies: async () => ({ get: () => cookie ? { value: cookie } : undefined }) },
    "next-auth": { default: () => ({ auth: async () => normal, handlers: {}, signIn() {}, signOut() {} }) }, "next-auth/providers/github": {},
  });
  try {
    await schema.ensureSchema();
    const template = await schema.createProject("demo-owner", demo.DEMO_ORIGIN + "/", demo.DEMO_REPO, "Margin");
    const personal = await schema.createProject("demo-owner", "https://www.trypreflight.dev", "James-Software/Preflight", "Preflight");
    const databaseUrl = "postgresql://fixture:password@database.example/demo?sslmode=require";
    await connection.saveProjectDatabase(template.id, "demo-owner", { origin: demo.DEMO_ORIGIN, connectionString: databaseUrl, checks: [] });
    await sql`INSERT INTO guest_demo_links(token_hash,template_project_id) VALUES(${hash},${template.id})`;
    const one = await demo.enterGuestDemo(code), two = await demo.enterGuestDemo(code);
    assert.notEqual(one.actor_id, two.actor_id); assert.notEqual(one.project_id, two.project_id);
    assert.equal((await demo.enterGuestDemo(code, { actor: one.actor_id, projectId: one.project_id })).project_id, one.project_id);
    assert.equal(await countProjects(), 4);
    const personalProjects = async () => (await schema.listProjects("demo-owner")).map(p => p.id).sort((a,b) => a-b);
    assert.deepEqual(await personalProjects(), [template.id,personal.id]);
    assert.deepEqual((await schema.listProjects(one.actor_id)).map(p => p.id), [one.project_id]);
    assert.deepEqual((await schema.listProjects(two.actor_id)).map(p => p.id), [two.project_id]);
    assert.equal((await schema.getProject(one.project_id, one.actor_id, "member")).repo_full_name, demo.DEMO_REPO);
    assert.equal(await schema.getProject(one.project_id, one.actor_id), null);
    assert.equal(await schema.getProject(template.id, one.actor_id, "member"), null);
    assert.equal(await schema.getProject(two.project_id, one.actor_id, "member"), null);
    assert.deepEqual(await schema.listRuns(one.project_id), []);
    assert.equal(await connection.profileProvisioningDatabase("demo-owner", one.project_id, demo.DEMO_ORIGIN), databaseUrl);
    const encrypted = await sql`SELECT encrypted_config FROM project_database_connections ORDER BY id`;
    assert.notEqual(encrypted[0].encrypted_config, encrypted[1].encrypted_config);
    const config = await connection.databaseForRun(one.project_id, "demo-owner", demo.DEMO_ORIGIN);
    assert.equal(config.snapshot.origin, demo.DEMO_ORIGIN); assert.equal(config.checks.length, 1);
    assert.equal(config.checks[0].buttonLabel, "Join the waitlist");
    const token = await sessions.encodeGuestSession(one); cookie = token.value;
    assert.equal((await authentication.auth()).user.isGuest, true);
    assert.equal((await sessions.readGuestSession(token.value)).user.githubId, one.actor_id);
    const decoded = await jwt.decode({ token: token.value, secret: process.env.AUTH_SECRET, salt: demo.guestCookieName() });
    assert.equal(decoded.preflightGuestIdentity, true); assert.equal(decoded.githubLogin, undefined);
    assert.equal(await sessions.readGuestSession("forged-guest"), null);
    cookie = "forged-guest"; assert.equal(await authentication.auth(), null);
    cookie = null; assert.equal((await authentication.auth()).user.githubId, "demo-owner");
    assert.deepEqual(await personalProjects(), [template.id,personal.id]);
    const request = (extra = {}) => new NextRequest("https://www.trypreflight.dev/demo/" + code, { headers: extra });
    let response = await route.GET(request({ cookie: `${demo.guestCookieName()}=${token.value}` }), { params: Promise.resolve({ code }) });
    assert.equal(response.status, 303); assert.equal(new URL(response.headers.get("location")).pathname, `/dashboard/projects/${one.project_id}`);
    const setCookie = response.headers.get("set-cookie");
    for (const text of ["__Host-preflight-guest=", "HttpOnly", "Secure", "SameSite=lax", "Path=/", "Max-Age="]) assert.ok(setCookie.includes(text), text);
    assert.ok(!setCookie.includes("authjs.session-token"));
    assert.equal(response.headers.get("referrer-policy"), "no-referrer"); assert.match(response.headers.get("cache-control"), /no-store/);
    response = await route.GET(request({ purpose: "prefetch" }), { params: Promise.resolve({ code }) });
    assert.equal(response.status, 204); assert.equal(await countProjects(), 4);
    response = await route.GET(request(), { params: Promise.resolve({ code: "invalid" }) }); assert.equal(response.status, 404);
    const grant = { projectId: one.project_id, actor: one.actor_id, owner: "demo-owner", repo: demo.DEMO_REPO };
    await access.assertProjectRepositoryAccess(grant, new URL(`https://api.github.com/repos/${demo.DEMO_REPO}/branches`));
    await assert.rejects(access.assertProjectRepositoryAccess(grant, new URL("https://api.github.com/repos/other/private")), /outside/);
    const github = load("lib/github.ts", { ...deps, "@/lib/project-repository-access": access });
    await assert.rejects(github.fetchGithub({ accessToken: "fixture", login: "demo-owner", projectGrant: grant }, `https://api.github.com/repos/${demo.DEMO_REPO}/pulls`, { method: "POST" }), /cannot change/);
    // The actual configuration/start handlers work with guest membership and
    // delegated owner reads; no judge GitHub session is supplied.
    const githubBoundary = { fetchGithub: async (ctx, raw) => {
      await access.assertProjectRepositoryAccess(ctx.projectGrant, new URL(raw));
      const suffix = new URL(raw).pathname.replace(`/repos/${demo.DEMO_REPO}`, "");
      const data = suffix === "" ? { default_branch: "main" } : suffix === "/branches" ? [{ name: "main" }] :
        suffix === "/branches/main" ? { name: "main", commit: { sha: "a".repeat(40) } } : [];
      return Response.json(data);
    }, getGithubContext: async () => null, GithubAuthError: class extends Error {} };
    const projectGithub = load("lib/project-github.ts", { ...deps, "@/lib/github": githubBoundary,
      "@/lib/github-credentials": { loadGithubCredentials: async () => ({ login: "james-software", accessToken: "fixture" }) },
    });
    const queued = [];
    const apiDeps = { ...deps, "@/auth": { auth: async () => sessions.readGuestSession(token.value) },
      "@/lib/github": githubBoundary, "@/lib/project-github": projectGithub,
      "@/lib/auth-profiles": { listAuthProfiles: async () => [] },
      "@/lib/trigger-client": { getTriggerClientConfig: () => ({}), swarmStartError: () => "fixture" },
      "@trigger.dev/sdk": { tasks: { trigger: async (_id, payload) => { queued.push(payload); } } },
    };
    apiDeps["@/lib/run-targets"] = load("lib/run-targets.ts", apiDeps);
    const options = load("app/api/projects/[id]/run-options/route.ts", apiDeps);
    const params = { params: Promise.resolve({ id: String(one.project_id) }) };
    response = await options.GET(new NextRequest(`https://www.trypreflight.dev/api/projects/${one.project_id}/run-options`), params);
    assert.equal(response.status, 200); assert.deepEqual((await response.json()).options.map(o => o.ref), ["main"]);
    response = await options.GET(new NextRequest(`https://www.trypreflight.dev/api/projects/${one.project_id}/run-options?type=branch&ref=main`), params);
    let payload = await response.json(); assert.equal(response.status, 200); assert.ok(payload.database); assert.equal(payload.target.sha, "a".repeat(40));
    const runsApi = load("app/api/projects/[id]/runs/route.ts", apiDeps);
    const post = body => new NextRequest(`https://www.trypreflight.dev/api/projects/${one.project_id}/runs`, { method: "POST",
      headers: { origin: "https://www.trypreflight.dev", "content-type": "application/json" }, body: JSON.stringify(body) });
    assert.equal((await runsApi.POST(post({ target: { type: "branch", ref: "other" } }), params)).status, 400);
    response = await runsApi.POST(post({ verifyDatabase: true }), params); payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload)); assert.equal(payload.run.target_sha, "a".repeat(40));
    assert.ok((await sql`SELECT database_snapshot FROM runs WHERE id=${payload.run.id}`)[0].database_snapshot); assert.equal(queued[0].runId, payload.run.id);
    assert.equal(JSON.stringify(payload).includes(databaseUrl), false);
    assert.equal((await runsApi.GET(new Request("https://www.trypreflight.dev"), { params: Promise.resolve({ id: String(two.project_id) }) })).status, 404);
    const run = await schema.createRun(one.project_id, demo.DEMO_ORIGIN);
    const prompt = await agent.createRunAgentGrant(one.project_id, run.id, one.actor_id, "judge-guest");
    const bearer = prompt.prompt.match(/pf_run_[A-Za-z0-9_-]{43}/)[0];
    assert.equal((await agent.authenticateRunAgent(`Bearer ${bearer}`)).actor_id, one.actor_id);
    await sql`UPDATE guest_demo_links SET revoked_at=NOW() WHERE token_hash=${hash}`;
    assert.equal(await sessions.readGuestSession(token.value), null);
    await assert.rejects(demo.enterGuestDemo(code), /expired/);
    await assert.rejects(access.assertProjectRepositoryAccess(grant, new URL(`https://api.github.com/repos/${demo.DEMO_REPO}`)), /ended/);
    await assert.rejects(agent.authenticateRunAgent(`Bearer ${bearer}`), /expired/);
    assert.deepEqual(await personalProjects(), [template.id,personal.id]);
    const exit = load("app/demo/exit/route.ts", deps);
    assert.equal((await exit.POST(new NextRequest("https://www.trypreflight.dev/demo/exit", { method: "POST", headers: { origin: "https://evil.example" } }))).status, 403);
    response = await exit.POST(new NextRequest("https://www.trypreflight.dev/demo/exit?next=login", { method: "POST", headers: { origin: "https://www.trypreflight.dev" } }));
    assert.equal(response.status, 303); assert.match(response.headers.get("location"), /\/login$/); assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
    assert.equal(await countProjects(), 4);
    // A successful OAuth callback clears only the guest cookie, preserving all
    // Auth.js cookies. Failed OAuth attempts keep the usable demo session.
    let oauthCookie = "__Secure-authjs.session-token=real-encrypted-session; Path=/; Secure; HttpOnly";
    const authRoute = load("app/api/auth/[...nextauth]/route.ts", { ...deps, "@/auth": { auth: authentication.auth,
      handlers: { GET: async () => new Response(null, { status: 302, headers: { location: "/dashboard", "set-cookie": oauthCookie } }) } } });
    response = await authRoute.GET(new NextRequest("https://www.trypreflight.dev/api/auth/callback/github?code=fixture"));
    assert.equal(response.status, 302); assert.equal(response.headers.get("location"), "/dashboard");
    assert.match(response.headers.get("set-cookie"), /authjs.session-token=real-encrypted-session/);
    assert.match(response.headers.get("set-cookie"), /__Host-preflight-guest=;.*Max-Age=0/);
    oauthCookie = "__Secure-authjs.session-token=; Path=/; Max-Age=0";
    response = await authRoute.GET(new NextRequest("https://www.trypreflight.dev/api/auth/callback/github?error=denied"));
    assert.ok(!response.headers.get("set-cookie").includes("preflight-guest"));
    oauthCookie = "__Secure-authjs.session-token.0=chunked-session; Path=/; Secure; HttpOnly";
    response = await authRoute.GET(new NextRequest("https://www.trypreflight.dev/api/auth/callback/github?code=fixture"));
    assert.match(response.headers.get("set-cookie"), /__Host-preflight-guest=/);
    console.log(JSON.stringify({ realPostgres: true, realEncryptedCookies: true, guestIsolation: true, databaseConnectionResealed: true, returningGuestReused: true, existingGitHubPreserved: true, personalProjectsExcludeGuestCopies: true, loggedOutAndExpiredDemosStayHidden: true, successfulOAuthExitsGuest: true, failedOAuthPreservesGuest: true, tamperRejected: true, prefetchSkipped: true, repoWritesDenied: true, revocationImmediate: true, guestAgentGrantScoped: true, runConfigurationAndQueue: true, databaseVerificationSelected: true, exitOriginChecked: true }));
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
