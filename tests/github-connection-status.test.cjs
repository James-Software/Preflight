const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load-module.cjs");
const { NextRequest } = require("next/server");
test("a valid app user without GitHub receives a connection requirement, not an expired-session redirect", async () => {
  for (const path of [
    "app/api/github/repos/route.ts",
    "app/api/github/repos/verify/route.ts",
  ]) {
    const issue = load("lib/github-connection-status.ts", {
      "@/auth": { auth: async () => ({ user: { githubId: "test:isolated" } }) },
    });
    const route = load(path, {
      "@/lib/github-connection-status": issue,
      "@/lib/github": { getGithubContext: async () => null },
    });
    const response = await route.GET(
      new NextRequest("https://www.trypreflight.dev/api/github/repos"),
    );
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.code, "GITHUB_NOT_CONNECTED");
    assert.equal(body.tokenMissing, undefined);
    assert.doesNotMatch(body.error, /expired/i);
  }
});
test("a missing app session still requires sign-in", async () => {
  const issue = load("lib/github-connection-status.ts", {
    "@/auth": { auth: async () => null },
  });
  assert.equal((await issue.githubConnectionStatus()).status, 401);
});
test("an existing GitHub connection still uses seamless renewal when its credentials expire", async () => {
  const issue = load("lib/github-connection-status.ts", {
    "@/auth": {
      auth: async () => ({ user: { githubId: "owner", githubLogin: "owner" } }),
    },
  });
  const result = await issue.githubConnectionStatus();
  assert.equal(result.status, 401);
  assert.equal(result.body.tokenExpired, true);
});
