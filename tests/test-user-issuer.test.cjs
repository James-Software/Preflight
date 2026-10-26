const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto");
const { load } = require("./load-module.cjs");
const { NextRequest } = require("next/server");
const SITE_URL = "https://www.trypreflight.dev";

async function fixture(t, sql = async () => []) {
  const previous = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = randomBytes(32).toString("base64");
  t.after(() => {
    if (previous === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previous;
  });
  const key = randomBytes(32),
    jwt = await import("next-auth/jwt");
  const issuer = load("lib/test-user-issuer.ts", {
    "next-auth/jwt": jwt,
    "@/lib/db": { getSql: () => sql },
    "@/lib/schema": { ensureSchema: async () => {} },
    "@/lib/auth-profile-state": { profileKey: () => key },
    "@/lib/profile-generation": {
      openTestAccount: () => ({ email: "qa@example.com", name: "QA" }),
    },
    "@/lib/site": { SITE_URL },
  });
  return { issuer, jwt };
}

test("issuer rejects unsigned or modified bodies before accessing the database", async (t) => {
  let queries = 0;
  const { issuer } = await fixture(t, async () => {
    queries++;
    return [];
  });
  const route = load("app/api/profiles/issue/route.ts", {
    "@/lib/test-user-issuer": issuer,
  });
  const body = JSON.stringify({ captureId: randomUUID() });
  for (const signature of ["", "bad", issuer.signTestUserRequest(body + " ")]) {
    const response = await route.POST(
      new NextRequest(SITE_URL + "/api/profiles/issue", {
        method: "POST",
        headers: { "x-preflight-issuer-signature": signature },
        body,
      }),
    );
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal(queries, 0);
});

test("expired worker grants never query or write test identities", async (t) => {
  let queries = 0;
  const { issuer } = await fixture(t, async () => {
    queries++;
    return [];
  });
  await assert.rejects(
    issuer.issueTestUser({
      captureId: randomUUID(),
      owner: "owner",
      projectId: 1,
      workToken: randomUUID(),
      timestamp: Date.now() - 120_000,
    }),
    /expired/,
  );
  assert.equal(queries, 0);
});

test("issuer creates a real Auth.js token with an isolated identity and bounded expiry", async (t) => {
  const id = randomUUID(),
    expiry = new Date(Date.now() + 600_000);
  const { issuer, jwt } = await fixture(t, async (parts) => {
    const sql = parts.join("?");
    if (sql.includes("SELECT c.*"))
      return [{ id, origin: SITE_URL, automation_credentials: "sealed" }];
    if (sql.includes("SELECT id,name,email"))
      return [
        {
          id: "test:" + id,
          name: "QA",
          email: "qa@example.com",
          expires_at: expiry,
        },
      ];
    return [];
  });
  const state = await issuer.issueTestUser({
    captureId: id,
    owner: "owner",
    projectId: 1,
    workToken: randomUUID(),
    timestamp: Date.now(),
  });
  const cookie = state.cookies[0];
  assert.equal(cookie.name, issuer.TEST_USER_COOKIE);
  assert.equal(cookie.domain, "www.trypreflight.dev");
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.secure, true);
  const decoded = await jwt.decode({
    token: cookie.value,
    secret: process.env.AUTH_SECRET,
    salt: cookie.name,
  });
  assert.equal(decoded.sub, "test:" + id);
  assert.equal(decoded.preflightTestIdentity, true);
  assert.equal(decoded.githubLogin, undefined);
  assert.equal(decoded.githubAccessToken, undefined);
  assert.ok(decoded.exp <= Math.floor(expiry.getTime() / 1000));
  await assert.rejects(
    jwt.decode({ token: cookie.value, secret: "wrong-key", salt: cookie.name }),
  );
});

test("test sessions fail closed when identity is revoked or the database is unavailable", async (t) => {
  let mode = "active",
    queries = 0;
  const { issuer } = await fixture(t, async () => {
    queries++;
    if (mode === "offline") throw new Error("unavailable");
    return mode === "active" ? [{ id: "test" }] : [];
  });
  assert.equal(await issuer.validateTestUserSession("real-owner"), false);
  assert.equal(queries, 0);
  const id = "test:" + randomUUID();
  assert.equal(await issuer.validateTestUserSession(id), true);
  mode = "revoked";
  assert.equal(await issuer.validateTestUserSession(id), false);
  mode = "offline";
  assert.equal(await issuer.validateTestUserSession(id), false);
});
