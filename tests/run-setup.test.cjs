const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load-module.cjs");
const state = load("lib/auth-profile-state.ts", {});
const targets = load("lib/run-targets.ts", {
  "@/lib/github": {
    GithubAuthError: class extends Error {},
    fetchGithub: (_ctx, url, init) => fetch(url, init),
  },
});
function key(t) {
  const previous = process.env.PROFILE_ENCRYPTION_KEY;
  process.env.PROFILE_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  t.after(() => {
    if (previous === undefined) delete process.env.PROFILE_ENCRYPTION_KEY;
    else process.env.PROFILE_ENCRYPTION_KEY = previous;
  });
}
const session = () =>
  state.parseProfileState(
    "https://app.example.com",
    JSON.stringify([
      {
        name: "session",
        value: "private-cookie",
        domain: ".example.com",
        httpOnly: true,
      },
    ]),
    JSON.stringify({ Authorization: "Bearer private-header" }),
  );

test("profile fields cannot submit secrets into a URL before JavaScript is ready", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const BrowserSetup = load("components/BrowserProfileSetup.tsx", {}).default;
  const AutomaticSetup = load("components/AutomaticProfileSetup.tsx", {
    "@/lib/profile-setup-response": load("lib/profile-setup-response.ts", {}),
  }).default;
  const Manager = load("components/ProfilesManager.tsx", {
    "@/components/BrowserProfileSetup": { default: BrowserSetup },
    "@/components/AutomaticProfileSetup": { default: AutomaticSetup },
  }).default;
  const html = renderToStaticMarkup(
    React.createElement(Manager, {
      projectId: 12,
      initialProfiles: [],
      initialOrigin: "https://app.example.com",
      returnTo: null,
    }),
  );
  const forms = html.match(/<form[^>]*>/g);
  assert.equal(forms.length, 2);
  for (const form of forms) assert.match(form, /method="post"/);
  assert.match(forms[0], /action="\/api\/profiles\/generate\?projectId=12"/);
  assert.match(forms[1], /action="\/api\/profiles\/browser\?projectId=12"/);
  assert.ok(!html.includes("Cookies or session JSON"));
  assert.match(html, /Advanced: import cookies or headers/);
  assert.match(html, /<fieldset disabled=""/);
});
test("profile encryption is randomized, authenticated and bound to owner and origin", (t) => {
  key(t);
  const input = session();
  const first = state.encryptProfile(input, "100", "https://app.example.com"),
    second = state.encryptProfile(input, "100", "https://app.example.com");
  assert.notEqual(first, second);
  assert.ok(!first.includes("private-cookie"));
  assert.deepEqual(
    state.decryptProfile(first, "100", "https://app.example.com"),
    JSON.parse(JSON.stringify(input)),
  );
  assert.throws(
    () => state.decryptProfile(first, "other", "https://app.example.com"),
    /unlock/,
  );
  assert.throws(
    () => state.decryptProfile(first, "100", "https://different.example.com"),
    /unlock/,
  );
  assert.throws(
    () =>
      state.decryptProfile(
        first.slice(0, -5) + "AAAAA",
        "100",
        "https://app.example.com",
      ),
    /unlock/,
  );
});
test("imports accept cookies, local storage and auth headers while rejecting unsafe or expired state", () => {
  const value = session();
  assert.equal(value.cookies[0].domain, "app.example.com");
  assert.equal(value.cookies[0].httpOnly, true);
  assert.equal(value.headers.authorization, "Bearer private-header");
  const local = state.parseProfileState(
    "https://app.example.com",
    JSON.stringify({
      cookies: [],
      origins: [
        {
          origin: "https://app.example.com",
          localStorage: [{ name: "auth", value: "private-storage" }],
        },
      ],
    }),
    "{}",
  );
  assert.equal(local.origins[0].localStorage[0].name, "auth");
  for (const cookies of [
    [{ name: "a", value: "b", domain: "other.example.com" }],
    [{ name: "a", value: "b", expires: 1 }],
    [{ name: "a", value: "b", sameSite: "__proto__" }],
    [{ name: "bad name", value: "b" }],
  ])
    assert.throws(() =>
      state.parseProfileState(
        "https://app.example.com",
        JSON.stringify(cookies),
        "{}",
      ),
    );
  for (const headers of [
    { Cookie: "a=b" },
    { Host: "other.test" },
    { Authorization: "bad\r\nvalue" },
    { Origin: "https://other.test" },
  ])
    assert.throws(() =>
      state.parseProfileState(
        "https://app.example.com",
        "[]",
        JSON.stringify(headers),
      ),
    );
  assert.throws(
    () => state.parseProfileState("https://app.example.com", "[]", "{}"),
    /Add cookies/,
  );
});
function github(t, { missing = false } = {}) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const parsed = new URL(url),
      path = parsed.pathname.replace("/repos/owner/app", "");
    calls.push(parsed);
    assert.equal(
      new Headers(options.headers).get("authorization"),
      "Bearer token",
    );
    if (path === "") return Response.json({ default_branch: "main" });
    if (path.startsWith("/branches/"))
      return Response.json({
        name: decodeURIComponent(path.slice(10)),
        commit: { sha: "branch-sha" },
      });
    if (path === "/pulls/42")
      return Response.json({
        number: 42,
        state: "open",
        head: { ref: "feature/pr", sha: "pr-sha" },
      });
    if (path === "/deployments")
      return Response.json(
        missing
          ? []
          : [
              { id: 1, sha: "wrong-sha" },
              { id: 2, sha: parsed.searchParams.get("sha") },
            ],
      );
    if (path === "/deployments/2/statuses")
      return Response.json([
        { state: "success", environment_url: "https://selected.preview.test" },
      ]);
    assert.fail(path);
  });
  return calls;
}
const ctx = { login: "owner", accessToken: "token" };
test("branch and PR runs resolve deployments from their exact head SHA; only default uses the configured App URL", async (t) => {
  const calls = github(t);
  const main = await targets.resolveRunTarget(
    ctx,
    "owner/app",
    { type: "branch", ref: "main" },
    "https://live.test",
  );
  assert.equal(main.url, "https://live.test");
  const branch = await targets.resolveRunTarget(
    ctx,
    "owner/app",
    { type: "branch", ref: "feature/test" },
    "https://live.test",
  );
  assert.equal(branch.url, "https://selected.preview.test/");
  assert.equal(branch.ref, "feature/test");
  const pr = await targets.resolveRunTarget(
    ctx,
    "owner/app",
    { type: "pull-request", number: 42 },
    "https://live.test",
  );
  assert.equal(pr.sha, "pr-sha");
  assert.deepEqual(
    calls
      .filter((c) => c.pathname.endsWith("/deployments"))
      .map((c) => c.searchParams.get("sha")),
    ["branch-sha", "pr-sha"],
  );
  assert.ok(!calls.some((c) => c.pathname.includes("/deployments/1/")));
});
test("a missing feature deployment never falls back to the live app", async (t) => {
  github(t, { missing: true });
  await assert.rejects(
    targets.resolveRunTarget(
      ctx,
      "owner/app",
      { type: "branch", ref: "feature/test" },
      "https://live.test",
    ),
    /No successful deployment/,
  );
  await assert.rejects(
    targets.resolveRunTarget(
      ctx,
      "someone/app",
      { type: "branch", ref: "main" },
      null,
    ),
    /repositories you own/,
  );
  for (const input of [
    null,
    { type: "branch", ref: " " },
    { type: "pull-request", number: "42" },
    { type: "pull-request", number: -1 },
  ])
    assert.throws(() => targets.parseRunTarget(input));
});
test("profile validation fails for revoked accounts and mismatched targets before browser allocation", async (t) => {
  key(t);
  const encrypted = state.encryptProfile(
    session(),
    "100",
    "https://app.example.com",
  );
  let row = {
    id: 3,
    name: "Customer",
    origin: "https://app.example.com",
    encrypted_state: encrypted,
    verification_path: "/dashboard",
    verification_text: "Workspace",
  };
  const api = load("lib/auth-profiles.ts", {
    "@/lib/github-credentials": {
      GithubRenewalUnavailable: class extends Error {},
    },
    "@/lib/auth-profile-state": state,
    "@/lib/schema": {
      ensureSchema: async () => {},
      getProject: async () => ({ id: 12 }),
    },
    "@/lib/db": { getSql: () => async () => (row ? [row] : []) },
  });
  assert.equal(
    (await api.profileForRun("100", 3, "https://app.example.com/dashboard", 12))
      .snapshot.encrypted_state,
    encrypted,
  );
  await assert.rejects(
    api.profileForRun("100", 3, "https://preview.example.com", 12),
    /Create or choose/,
  );
  row = null;
  await assert.rejects(
    api.profileForRun("100", 3, "https://app.example.com", 12),
    /unavailable/,
  );
  await assert.rejects(api.getRunAuthentication(12), /removed/);
});
test("authenticated browsers receive isolated storage and scoped headers; failed access is a setup error", async () => {
  const auth = {
    origin: "https://app.example.com",
    verification_path: "/dashboard",
    verification_text: "Workspace",
    state: session(),
  };
  let contextOptions,
    routeHandler,
    closed = false;
  const page = {
    goto: async () => ({ status: () => 200 }),
    url: () => auth.origin + "/dashboard",
    locator: () => ({ first: () => ({ isVisible: async () => false }) }),
    getByText: () => ({ first: () => ({ waitFor: async () => {} }) }),
  };
  const context = {
    route: async (_, handler) => {
      routeHandler = handler;
    },
    newPage: async () => page,
    close: async () => {
      closed = true;
    },
  };
  const browser = {
    newContext: async (options) => {
      contextOptions = options;
      return context;
    },
  };
  const { authenticatedPage, profileRedactor } = load(
    "lib/browser-auth.ts",
    {},
  );
  assert.equal(await authenticatedPage(browser, auth), page);
  assert.equal(contextOptions.serviceWorkers, "block");
  assert.equal(contextOptions.storageState.cookies[0].value, "private-cookie");
  let fetched,
    continued = false;
  await routeHandler({
    request: () => ({ url: () => auth.origin + "/data", headers: () => ({}) }),
    fetch: async (options) => {
      fetched = options;
      return {};
    },
    fulfill: async () => {},
  });
  assert.equal(fetched.headers.authorization, "Bearer private-header");
  assert.equal(fetched.maxRedirects, 0);
  await routeHandler({
    request: () => ({
      url: () => "https://third-party.test/data",
      headers: () => ({}),
    }),
    continue: async () => {
      continued = true;
    },
  });
  assert.equal(continued, true);
  assert.equal(
    profileRedactor(auth)(
      "private-cookie Bearer private-header private-header",
    ),
    "[redacted] [redacted] [redacted]",
  );
  page.url = () => auth.origin + "/login";
  await assert.rejects(authenticatedPage(browser, auth), /setup failure/);
  assert.equal(closed, true);
});
test("private Browserbase sessions disable provider recordings and release with the documented API", async (t) => {
  const old = process.env.BROWSERBASE_API_KEY;
  process.env.BROWSERBASE_API_KEY = "test-key";
  t.after(() => {
    if (old === undefined) delete process.env.BROWSERBASE_API_KEY;
    else process.env.BROWSERBASE_API_KEY = old;
  });
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    return Response.json({ id: "session-1" });
  });
  const api = load("lib/browserbase.ts", {});
  await api.createBrowserSession(true);
  await api.closeBrowserSession("session-1");
  assert.deepEqual(JSON.parse(calls[0].options.body).browserSettings, {
    recordSession: false,
    logSession: false,
  });
  assert.equal(calls[1].options.method, "POST");
  assert.equal(JSON.parse(calls[1].options.body).status, "REQUEST_RELEASE");
});
test("run start saves target/profile metadata and sends no credentials in the Trigger payload", async () => {
  let created, triggered;
  const profile = {
    id: 3,
    name: "Customer",
    snapshot: { encrypted_state: "encrypted-only" },
  };
  const route = load("app/api/projects/[id]/runs/route.ts", {
    "@/auth": { auth: async () => ({ user: { githubId: "100" } }) },
    "@/lib/database-connections": {},
    "@/lib/database-check-config": {},
    "@/lib/auth-profiles": { profileForRun: async () => profile },
    "@/lib/github-credentials": {
      GithubRenewalUnavailable: class extends Error {},
    },
    "@/lib/auth-profile-state": state,
    "@/lib/run-targets": {
      ...targets,
      resolveRunTarget: async () => ({
        url: "https://selected.preview.test",
        ref: "feature/test",
        sha: "commit-sha",
      }),
    },
    "@/lib/github": {
      GithubAuthError: class extends Error {},
      getGithubContext: async () => ctx,
    },
    "@/lib/trigger-client": {
      getTriggerClientConfig: () => ({}),
      swarmStartError: () => "worker error",
    },
    "@/lib/schema": {
      getProject: async () => ({
        id: 1,
        repo_full_name: "owner/app",
        app_url: "https://live.test",
      }),
      createRun: async (...args) => {
        created = args;
        return { id: 12 };
      },
    },
    "@trigger.dev/sdk": {
      tasks: {
        trigger: async (...args) => {
          triggered = args;
        },
      },
    },
  });
  const response = await route.POST(
    new Request("https://preflight.test/api/projects/1/runs", {
      method: "POST",
      headers: {
        origin: "https://preflight.test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target: { type: "branch", ref: "feature/test" },
        profileId: 3,
      }),
    }),
    { params: Promise.resolve({ id: "1" }) },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(created, [
    1,
    "https://selected.preview.test",
    {
      repoFullName: "owner/app",
      targetRef: "feature/test",
      targetSha: "commit-sha",
      profile,
    },
  ]);
  assert.deepEqual(triggered[1], {
    runId: 12,
    targetUrl: "https://selected.preview.test",
  });
});

test("redaction masks nested auth tokens without hiding navigation labels or theme preferences", () => {
  const { profileRedactor } = load("lib/browser-auth.ts", {});
  const auth = {
    state: {
      cookies: [],
      headers: {},
      origins: [
        {
          localStorage: [
            {
              name: "auth",
              value: JSON.stringify({
                access_token: "private-access-token",
                user: { name: "Workspace", role: "admin" },
              }),
            },
            { name: "theme", value: "dark" },
          ],
        },
      ],
    },
  };
  assert.equal(
    profileRedactor(auth)("private-access-token Workspace admin dark"),
    "[redacted] Workspace admin dark",
  );
});
