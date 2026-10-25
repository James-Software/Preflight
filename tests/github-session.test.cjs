const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load-module.cjs");

function environment(t) {
  for (const [name, value] of Object.entries({
    AUTH_SECRET: "test-only-auth-secret",
    AUTH_GITHUB_ID: "test-client",
    AUTH_GITHUB_SECRET: "test-client-secret",
  })) {
    const previous = process.env[name];
    process.env[name] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
  }
}
function store(t) {
  environment(t);
  let row = null;
  const queries = [];
  const sql = async (parts, ...v) => {
    const q = parts.join("?").replace(/\s+/g, " ").trim();
    queries.push({ q, v });
    if (q.startsWith("CREATE TABLE")) return [];
    if (q.startsWith("INSERT INTO")) {
      const [owner, provider, login, encrypted] = v;
      if (
        row &&
        row.provider_github_id === provider &&
        row.owner_github_id !== owner
      )
        return [];
      row = {
        owner_github_id: owner,
        provider_github_id: provider,
        login,
        encrypted_tokens: encrypted,
        reauth_required: false,
        refresh_lease_id: null,
      };
      return [{ owner_github_id: owner }];
    }
    if (q.includes("WHERE provider_github_id"))
      return row && row.provider_github_id === v[0]
        ? [{ owner_github_id: row.owner_github_id }]
        : [];
    if (q.startsWith("SELECT"))
      return row && row.owner_github_id === v[0] ? [{ ...row }] : [];
    if (q.includes("SET reauth_required = TRUE")) {
      if (
        row &&
        row.owner_github_id === v[0] &&
        row.encrypted_tokens === v[1] &&
        row.refresh_lease_id === v[2]
      )
        Object.assign(row, {
          reauth_required: true,
          encrypted_tokens: null,
          refresh_lease_id: null,
        });
      return [];
    }
    if (q.includes("SET refresh_lease_id = ?::uuid")) {
      if (
        row &&
        row.owner_github_id === v[1] &&
        row.encrypted_tokens === v[2] &&
        !row.refresh_lease_id &&
        !row.reauth_required
      ) {
        row.refresh_lease_id = v[0];
        return [{ owner_github_id: row.owner_github_id }];
      }
      return [];
    }
    if (q.includes("SET encrypted_tokens = ?")) {
      if (
        row &&
        row.owner_github_id === v[1] &&
        row.refresh_lease_id === v[2] &&
        row.encrypted_tokens === v[3]
      ) {
        row.encrypted_tokens = v[0];
        row.refresh_lease_id = null;
        return [{ owner_github_id: row.owner_github_id }];
      }
      return [];
    }
    if (q.includes("SET refresh_lease_id = NULL")) {
      if (row?.owner_github_id === v[0] && row.refresh_lease_id === v[1])
        row.refresh_lease_id = null;
      return [];
    }
    assert.fail(q);
  };
  const api = load("lib/github-credentials.ts", {
    "@/lib/db": { getSql: () => sql },
    "node:timers/promises": {
      setTimeout: async () => new Promise((resolve) => setTimeout(resolve, 1)),
    },
  });
  return { api, row: () => row, queries };
}
const expired = () => ({
  accessToken: "old-access-token",
  refreshToken: "old-refresh-token",
  expiresAt: Date.now() - 1000,
  refreshExpiresAt: Date.now() + 1000 * 60 * 60 * 24 * 30,
});
const rotated = () => ({
  access_token: "new-access-token",
  refresh_token: "new-refresh-token",
  expires_in: 28800,
  refresh_token_expires_in: 15897600,
});

test("OAuth credentials stay encrypted at rest; valid and non-expiring grants need no renewal", async (t) => {
  const { api, row } = store(t);
  t.mock.method(globalThis, "fetch", () =>
    assert.fail("valid tokens must not renew"),
  );
  await api.saveGithubCredentials(
    "legacy-owner",
    "owner",
    { ...expired(), expiresAt: Date.now() + 3600000 },
    "123",
  );
  assert.ok(!row().encrypted_tokens.includes("old-access-token"));
  assert.ok(!row().encrypted_tokens.includes("old-refresh-token"));
  assert.deepEqual(await api.loadGithubCredentials("legacy-owner"), {
    accessToken: "old-access-token",
    login: "owner",
  });
  assert.equal(await api.savedGithubOwner("123"), "legacy-owner");
  assert.equal(await api.loadGithubCredentials("different-owner"), null);
  await api.saveGithubCredentials(
    "legacy-owner",
    "owner",
    {
      accessToken: "non-expiring",
      refreshToken: null,
      expiresAt: null,
      refreshExpiresAt: null,
    },
    "123",
  );
  assert.equal(
    (await api.loadGithubCredentials("legacy-owner")).accessToken,
    "non-expiring",
  );
});
test("simultaneous requests rotate once, store the replacement refresh token, and silently reuse it", async (t) => {
  const { api, row } = store(t);
  await api.saveGithubCredentials("100", "owner", expired());
  let calls = 0;
  const refreshTokens = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls++;
    assert.equal(url, "https://github.com/login/oauth/access_token");
    assert.equal(options.method, "POST");
    assert.equal(options.cache, "no-store");
    const body = new URLSearchParams(options.body);
    assert.equal(body.get("grant_type"), "refresh_token");
    assert.equal(body.get("client_id"), "test-client");
    refreshTokens.push(body.get("refresh_token"));
    await new Promise((resolve) => setTimeout(resolve, 15));
    return Response.json(rotated());
  });
  const results = await Promise.all(
    Array.from({ length: 6 }, () => api.loadGithubCredentials("100")),
  );
  assert.equal(calls, 1);
  assert.ok(
    results.every((result) => result.accessToken === "new-access-token"),
  );
  assert.equal(row().refresh_lease_id, null);
  assert.equal(
    (await api.loadGithubCredentials("100")).accessToken,
    "new-access-token",
  );
  assert.equal(calls, 1);
  const now = Date.now();
  t.mock.method(Date, "now", () => now + 9 * 3600000);
  await api.loadGithubCredentials("100");
  assert.deepEqual(refreshTokens, ["old-refresh-token", "new-refresh-token"]);
});
test("a temporary GitHub outage retains credentials and releases the lease for a later retry", async (t) => {
  const { api, row } = store(t);
  await api.saveGithubCredentials("100", "owner", expired());
  const encrypted = row().encrypted_tokens;
  let attempts = 0;
  t.mock.method(globalThis, "fetch", async () =>
    ++attempts === 1
      ? Response.json(
          { error_description: "private response body" },
          { status: 503 },
        )
      : Response.json(rotated()),
  );
  await assert.rejects(
    api.loadGithubCredentials("100"),
    (error) =>
      error instanceof api.GithubRenewalUnavailable &&
      !error.message.includes("private"),
  );
  assert.equal(row().encrypted_tokens, encrypted);
  assert.equal(row().refresh_lease_id, null);
  assert.equal(row().reauth_required, false);
  assert.equal(
    (await api.loadGithubCredentials("100")).accessToken,
    "new-access-token",
  );
});
test("expired or revoked refresh grants require reconnect without retrying stale credentials forever", async (t) => {
  const { api, row } = store(t);
  await api.saveGithubCredentials("100", "owner", expired());
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json({
      error: "bad_refresh_token",
      error_description: "do not disclose this",
    });
  });
  await assert.rejects(
    api.loadGithubCredentials("100"),
    api.GithubReconnectRequired,
  );
  assert.equal(row().reauth_required, true);
  assert.equal(row().encrypted_tokens, null);
  await assert.rejects(
    api.loadGithubCredentials("100"),
    api.GithubReconnectRequired,
  );
  assert.equal(calls, 1);
  await api.saveGithubCredentials("100", "owner", {
    ...expired(),
    refreshExpiresAt: Date.now() - 1000,
  });
  await assert.rejects(
    api.loadGithubCredentials("100"),
    api.GithubReconnectRequired,
  );
  assert.equal(calls, 1);
});
test("a renewal cannot overwrite a newer OAuth login", async (t) => {
  const { api } = store(t);
  await api.saveGithubCredentials("100", "owner", expired());
  t.mock.method(globalThis, "fetch", async () => {
    await api.saveGithubCredentials("100", "owner", {
      ...expired(),
      accessToken: "newer-login",
      expiresAt: Date.now() + 3600000,
    });
    return Response.json(rotated());
  });
  assert.equal(
    (await api.loadGithubCredentials("100")).accessToken,
    "newer-login",
  );
});
test("concurrent sign-ins keep the first canonical owner and encrypt for that owner", async (t) => {
  const { api } = store(t);
  await api.saveGithubCredentials(
    "legacy-owner",
    "owner",
    { ...expired(), expiresAt: null },
    "123",
  );
  assert.equal(
    await api.saveGithubCredentials(
      "new-random-auth-id",
      "owner",
      { ...expired(), accessToken: "second-login", expiresAt: null },
      "123",
    ),
    "legacy-owner",
  );
  assert.equal(
    (await api.loadGithubCredentials("legacy-owner")).accessToken,
    "second-login",
  );
});

function authConfiguration({ previous = null, canonical = null } = {}) {
  let config;
  const saved = [];
  load("auth.ts", {
    "next-auth": {
      default: (options) => {
        config = options;
        return {};
      },
    },
    "next-auth/providers/github": { default: () => ({}) },
    "next/headers": { headers: async () => new Headers() },
    "next-auth/jwt": { getToken: async () => previous },
    "@/lib/access": {},
    "@/lib/invites": {},
    "@/lib/github-credentials": {
      savedGithubOwner: async () => canonical,
      saveGithubCredentials: async (...args) => {
        saved.push(args);
        return args[0];
      },
    },
  });
  return { callbacks: config.callbacks, saved };
}
const account = () => ({
  providerAccountId: "123",
  access_token: "private-access",
  refresh_token: "private-refresh",
  expires_at: Math.floor(Date.now() / 1000) + 28800,
  refresh_token_expires_in: 15897600,
});
test("reconnect preserves the existing project owner and persists refresh metadata without exposing tokens in the session", async () => {
  const { callbacks, saved } = authConfiguration({
    previous: { sub: "legacy-project-owner", githubLogin: "Owner" },
  });
  const token = await callbacks.jwt({
    token: { sub: "random-new-auth-id", githubAccessToken: "old-cookie-token" },
    profile: { login: "owner" },
    account: account(),
  });
  assert.equal(token.sub, "legacy-project-owner");
  assert.equal(token.githubProviderId, "123");
  assert.equal(token.githubAccessToken, undefined);
  assert.equal(saved[0][2].refreshToken, "private-refresh");
  assert.ok(saved[0][2].refreshExpiresAt > Date.now());
  const session = await callbacks.session({ session: { user: {} }, token });
  assert.equal(session.user.githubId, "legacy-project-owner");
  assert.ok(!JSON.stringify(session).includes("private"));
  const returning = authConfiguration({ canonical: "legacy-project-owner" });
  assert.equal(
    (
      await returning.callbacks.jwt({
        token: { sub: "another-new-auth-id" },
        profile: { login: "owner" },
        account: account(),
      })
    ).sub,
    "legacy-project-owner",
  );
});
test("signing in as a different GitHub account never adopts the prior session owner", async () => {
  const { callbacks } = authConfiguration({
    previous: { sub: "someone-else", githubLogin: "different-user" },
  });
  assert.equal(
    (
      await callbacks.jwt({
        token: { sub: "random-auth-id" },
        profile: { login: "owner" },
        account: account(),
      })
    ).sub,
    "123",
  );
});
test("a stored connection wins over legacy cookie tokens and a revoked stored grant cannot resurrect the old cookie token", async () => {
  class Reconnect extends Error {}
  let revoked = false;
  const api = load("lib/github.ts", {
    "next-auth/jwt": {
      getToken: async () => ({
        sub: "legacy-owner",
        githubAccessToken: "stale-token",
        githubLogin: "owner",
      }),
    },
    "@/lib/github-credentials": {
      GithubReconnectRequired: Reconnect,
      loadGithubCredentials: async () => {
        if (revoked) throw new Reconnect();
        return { accessToken: "renewed-token", login: "owner" };
      },
    },
  });
  assert.equal((await api.getGithubContext({})).accessToken, "renewed-token");
  revoked = true;
  assert.equal(await api.getGithubContext({}), null);
});
test("a GitHub API request retries once with a token another request has just renewed", async (t) => {
  const tokens = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    tokens.push(new Headers(options.headers).get("Authorization"));
    return Response.json({}, { status: tokens.length === 1 ? 401 : 200 });
  });
  const { fetchGithub } = load("lib/github.ts", {
    "next-auth/jwt": {},
    "@/lib/github-credentials": {
      GithubReconnectRequired: class extends Error {},
      loadGithubCredentials: async () => ({
        accessToken: "rotated-token",
        login: "owner",
      }),
    },
  });
  const ctx = {
    accessToken: "old-token",
    login: "owner",
    ownerGithubId: "100",
  };
  assert.equal(
    (await fetchGithub(ctx, "https://api.github.com/user")).status,
    200,
  );
  assert.deepEqual(tokens, ["Bearer old-token", "Bearer rotated-token"]);
  assert.equal(ctx.accessToken, "rotated-token");
});
test("explicit reconnect bypasses the signed-in login shortcut while preserving the safe return URL", async () => {
  const returnTo =
    "/dashboard/projects/1?configureRun=1&target=pr%3A42&profileId=9";
  const page = load("app/login/page.tsx", {
    "@/auth": { auth: async () => ({ user: { githubId: "100" } }) },
    "next/navigation": {
      redirect: (url) => {
        throw Object.assign(new Error("redirect"), { url });
      },
    },
    "@/lib/return-to": { safeReturnTo: (value) => value },
    "@/components/LoginHandoff": { default: () => null },
  }).default;
  await assert.rejects(
    page({ searchParams: Promise.resolve({ callbackUrl: returnTo }) }),
    (error) => error.url === returnTo,
  );
  assert.equal(
    (
      await page({
        searchParams: Promise.resolve({
          callbackUrl: returnTo,
          reauth: "github",
        }),
      })
    ).props.returnTo,
    returnTo,
  );
});
test("automatic reconnect preserves setup and prevents redirect loops, including when storage is blocked", (t) => {
  let url = new URL("https://preflight.test/dashboard/projects/1"),
    assigned = "";
  const memory = new Map();
  const oldWindow = global.window,
    oldStorage = global.sessionStorage;
  global.window = {
    location: {
      get origin() {
        return url.origin;
      },
      get search() {
        return url.search;
      },
      get href() {
        return url.href;
      },
      assign: (value) => {
        assigned = value;
      },
    },
    history: {
      state: null,
      replaceState: (_s, _t, value) => {
        url = new URL(value, url);
      },
    },
  };
  global.sessionStorage = {
    getItem: (key) => memory.get(key) || null,
    setItem: (key, value) => memory.set(key, value),
  };
  t.after(() => {
    global.window = oldWindow;
    global.sessionStorage = oldStorage;
  });
  const { safeReturnTo } = load("lib/return-to.ts", {
    "./site": { SITE_URL: "https://preflight.test" },
  });
  const { reconnectGithub, githubReconnected } = load(
    "lib/github-reconnect.ts",
    { "@/lib/return-to": { safeReturnTo } },
  );
  assert.equal(
    reconnectGithub(
      "/dashboard/projects/1?configureRun=1&target=pr%3A42&profileId=9",
    ),
    true,
  );
  const destination = new URL(assigned, url);
  assert.equal(destination.pathname, "/login");
  assert.equal(destination.searchParams.get("reauth"), "github");
  const callback = destination.searchParams.get("callbackUrl");
  assert.match(callback, /profileId=9/);
  assert.match(callback, /target=pr%3A42/);
  assert.match(callback, /githubReauth=1/);
  assert.equal(reconnectGithub("/dashboard/projects/1"), false);
  url = new URL(callback, url);
  assert.equal(reconnectGithub(url.pathname + url.search), false);
  githubReconnected();
  assert.equal(url.searchParams.has("githubReauth"), false);
  const later = Date.now() + 61_000;
  t.mock.method(Date, "now", () => later);
  assert.equal(reconnectGithub("/dashboard/projects/1"), true);
  global.sessionStorage = {
    getItem: () => {
      throw Error();
    },
    setItem: () => {
      throw Error();
    },
  };
  url.searchParams.set("githubReauth", "1");
  assert.equal(reconnectGithub("/dashboard/projects/1"), false);
  assert.equal(reconnectGithub("/dashboard/projects/1", true), true);
});

test("run options distinguish permanent reconnect from a temporary refresh failure", async () => {
  class AuthError extends Error {}
  class RenewalUnavailable extends Error {}
  for (const [failure, expected] of [
    [null, 401],
    [new AuthError(), 401],
    [new RenewalUnavailable("Temporary renewal failure"), 503],
  ]) {
    const route = load("app/api/projects/[id]/run-options/route.ts", {
      "@/auth": { auth: async () => ({ user: { githubId: "100" } }) },
      "@/lib/schema": {
        getProject: async () => ({ id: 1, repo_full_name: "owner/app" }),
      },
      "@/lib/github": {
        GithubAuthError: AuthError,
        getGithubContext: async () => {
          if (failure instanceof RenewalUnavailable) throw failure;
          return failure ? { login: "owner", accessToken: "token" } : null;
        },
      },
      "@/lib/github-credentials": {
        GithubRenewalUnavailable: RenewalUnavailable,
      },
      "@/lib/database-connections": {},
      "@/lib/auth-profiles": { listAuthProfiles: async () => [] },
      "@/lib/run-targets": {
        RunTargetError: class extends Error {},
        listRunTargets: async () => {
          throw failure;
        },
      },
    });
    const { NextRequest } = require("next/server");
    const response = await route.GET(
      new NextRequest("https://preflight.test/api/projects/1/run-options"),
      { params: Promise.resolve({ id: "1" }) },
    );
    assert.equal(response.status, expected);
    const body = await response.json();
    assert.equal(
      body.code,
      expected === 401 ? "GITHUB_REAUTH_REQUIRED" : undefined,
    );
  }
});
