const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load-module.cjs");
test("workers renew only managed profiles through a signed web request, without needing the auth secret", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url, init });
    return Response.json({ renewed: true });
  });
  let managed = false;
  const api = load("lib/run-authentication.ts", {
    "@/lib/db": { getSql: () => async () => (managed ? [{ id: 19 }] : []) },
    "@/lib/auth-profile-state": { ProfileError: class extends Error {} },
    "@/lib/test-user-issuer": {
      signTestUserRequest: () => "signed-server-request",
    },
    "@/lib/site": { SITE_URL: "https://www.trypreflight.dev" },
  });
  assert.equal(await api.renewRunAuthentication(19), false);
  assert.equal(calls.length, 0);
  managed = true;
  assert.equal(await api.renewRunAuthentication(19), true);
  assert.equal(
    calls[0].url.href,
    "https://www.trypreflight.dev/api/profiles/renew",
  );
  assert.equal(
    calls[0].init.headers["x-preflight-issuer-signature"],
    "signed-server-request",
  );
  assert.equal(calls[0].init.redirect, "error");
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(Object.keys(body).sort(), ["action", "runId", "timestamp"]);
  assert.equal(body.action, "renew-run");
});
test("a rejected renewal fails preflight instead of launching with stale credentials", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: "private internal message" }, { status: 409 }),
  );
  const api = load("lib/run-authentication.ts", {
    "@/lib/db": { getSql: () => async () => [{ id: 19 }] },
    "@/lib/auth-profile-state": { ProfileError: class extends Error {} },
    "@/lib/test-user-issuer": { signTestUserRequest: () => "signature" },
    "@/lib/site": { SITE_URL: "https://www.trypreflight.dev" },
  });
  await assert.rejects(
    api.renewRunAuthentication(19),
    (error) =>
      /Could not renew/.test(error.message) &&
      !error.message.includes("private internal"),
  );
});
