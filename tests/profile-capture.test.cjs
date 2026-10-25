const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load-module.cjs");
const state = load("lib/auth-profile-state.ts", {});
function fixture(options = {}) {
  const calls = [],
    sqlCalls = [];
  const row = {
    session_id: "browser-123",
    origin: "https://app.example.com",
    verification_path: "/dashboard",
    verification_text: "Your workspace",
  };
  const sql = async (strings, ...values) => {
    const query = strings.join("?");
    sqlCalls.push({ query, values });
    if (query.includes("SELECT * FROM profile"))
      return [{ id: 7, name: "Test user", origin: row.origin }];
    if (query.includes("RETURNING *")) return options.noGrant ? [] : [row];
    if (query.includes("ON CONFLICT"))
      return options.duplicate
        ? []
        : [
            {
              id: "capture",
              expires_at: new Date(Date.now() + 600000).toISOString(),
            },
          ];

    return [];
  };
  const browser = {
    contexts: () => [
      {
        storageState: async () => ({
          cookies: [
            {
              name: "session",
              value: "private-secret",
              domain: "app.example.com",
              expires: -1,
            },
          ],
          origins: [],
        }),
        pages: () => [
          {
            goto: async (url) => {
              calls.push(["goto", url]);
            },
          },
        ],
      },
    ],
    close: async () => calls.push(["disconnect"]),
  };
  const api = load("lib/profile-capture.ts", {
    "@/lib/db": { getSql: () => sql },
    "@/lib/schema": { ensureSchema: async () => {} },
    "@/lib/auth-profile-state": state,
    "@/lib/browserbase": {
      createBrowserSession: async (...args) => {
        calls.push(["allocate", ...args]);
        return { id: "browser-123", connectUrl: "server-only-cdp-key" };
      },
      closeBrowserSession: async (id) => calls.push(["release", id]),
      browserConnectUrl: (id) => `server-only-${id}`,
      browserLiveUrl: async () =>
        "https://www.browserbase.com/devtools/session",
    },
    "playwright-core": { chromium: { connectOverCDP: async () => browser } },
    "@/lib/browser-auth": {
      authenticatedPage: async (_browser, auth) => {
        calls.push(["verify", auth]);
        if (options.failVerify) throw new Error("private-secret error");
        return {
          context: () => ({
            close: async () => calls.push(["close-verification"]),
          }),
        };
      },
    },
  });
  return { api, calls, sqlCalls };
}
const input = {
  name: "Test user",
  origin: "https://app.example.com",
  verificationPath: "/dashboard",
  verificationText: "Your workspace",
};
function key(t) {
  const old = process.env.PROFILE_ENCRYPTION_KEY;
  process.env.PROFILE_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
  t.after(() => {
    if (old === undefined) delete process.env.PROFILE_ENCRYPTION_KEY;
    else process.env.PROFILE_ENCRYPTION_KEY = old;
  });
}
test("browser profiles require a public HTTPS app and explicit signed-in evidence", () => {
  const { api } = fixture();
  for (const patch of [
    { origin: "http://app.example.com" },
    { origin: "https://127.0.0.1" },
    { verificationPath: "https://other.example.com" },
    { verificationPath: "/login" },
    { verificationText: "" },
    { verificationPath: "/dashboard?token=secret" },
  ])
    assert.throws(() => api.captureDetails({ ...input, ...patch }));
  assert.equal(api.captureDetails(input).path, "/dashboard");
});
test("capture discards third-party and expired cookies and other origins", () => {
  const { api } = fixture();
  const result = api.scopedCaptureState(input.origin, {
    cookies: [
      { name: "app", value: "keep", domain: ".example.com", expires: -1 },
      {
        name: "provider",
        value: "discard",
        domain: "accounts.google.com",
        expires: -1,
      },
      {
        name: "expired",
        value: "discard",
        domain: "app.example.com",
        expires: 1,
      },
    ],
    origins: [
      {
        origin: input.origin,
        localStorage: [{ name: "session", value: "keep" }],
      },
      {
        origin: "https://accounts.google.com",
        localStorage: [{ name: "token", value: "discard" }],
      },
    ],
  });
  assert.equal(result.cookies.length, 1);
  assert.equal(result.cookies[0].domain, "app.example.com");
  assert.equal(result.origins.length, 1);
});
test("interactive allocation is private, bounded, single-owner and returns no CDP key", async (t) => {
  key(t);
  const { api, calls, sqlCalls } = fixture();
  const result = await api.startProfileCapture("owner", input);
  assert.deepEqual(
    calls.find((c) => c[0] === "allocate"),
    ["allocate", true, true],
  );
  assert.deepEqual(
    calls.find((c) => c[0] === "goto"),
    ["goto", "https://app.example.com/dashboard"],
  );
  assert.ok(!JSON.stringify(result).includes("cdp"));
  assert.ok(
    sqlCalls.find(
      (c) => c.query.includes("ON CONFLICT") && c.values.includes("owner"),
    ),
  );
  const duplicate = fixture({ duplicate: true });
  await assert.rejects(
    duplicate.api.startProfileCapture("owner", input),
    /already open/,
  );
  assert.equal(duplicate.calls.length, 0);
});
test("save verifies replay before atomic encrypted insert, then releases the browser", async (t) => {
  key(t);
  const { api, calls, sqlCalls } = fixture();
  const result = await api.finishProfileCapture(
    "owner",
    "12345678-1234-1234-1234-123456789abc",
  );
  assert.equal(result.id, 7);
  assert.ok(
    calls.some(
      (c) =>
        c[0] === "verify" && c[1].state.cookies[0].value === "private-secret",
    ),
  );
  const insert = sqlCalls.find((c) =>
    c.query.includes("SELECT * FROM profile"),
  );
  assert.ok(insert.query.includes("expires_at > NOW()"));
  assert.ok(!JSON.stringify(insert).includes("private-secret"));
  const encrypted = insert.values.find(
    (v) => typeof v === "string" && v.startsWith("v1."),
  );
  assert.equal(
    state.decryptProfile(encrypted, "owner", input.origin).cookies[0].value,
    "private-secret",
  );
  assert.ok(calls.some((c) => c[0] === "release"));
});
test("verification failures save nothing, sanitize errors and permit retry", async (t) => {
  key(t);
  const { api, sqlCalls, calls } = fixture({ failVerify: true });
  await assert.rejects(
    api.finishProfileCapture("owner", "12345678-1234-1234-1234-123456789abc"),
    (error) =>
      !error.message.includes("private-secret") &&
      /Nothing was saved/.test(error.message),
  );
  assert.ok(
    !sqlCalls.some((c) => c.query.includes("INSERT INTO auth_profiles")),
  );
  assert.ok(sqlCalls.some((c) => c.query.includes("SET status='active'")));
  assert.ok(!calls.some((c) => c[0] === "release"));
});
test("foreign, expired or consumed grants cannot connect to a browser; cancel releases without saving", async (t) => {
  key(t);
  const foreign = fixture({ noGrant: true });
  await assert.rejects(
    foreign.api.finishProfileCapture(
      "other",
      "12345678-1234-1234-1234-123456789abc",
    ),
    /unavailable/,
  );
  assert.equal(foreign.calls.length, 0);
  assert.ok(foreign.sqlCalls[0].query.includes("owner_github_id=?"));
  const cancel = fixture();
  assert.equal(
    await cancel.api.finishProfileCapture(
      "owner",
      "12345678-1234-1234-1234-123456789abc",
      true,
    ),
    null,
  );
  assert.deepEqual(cancel.calls, [["release", "browser-123"]]);
});
test("browser profile API blocks foreign origins and unauthenticated callers before allocation", async () => {
  const { NextRequest } = require("next/server");
  let user = null,
    allocations = 0;
  const route = load("app/api/profiles/browser/route.ts", {
    "@/auth": { auth: async () => user },
    "next/cache": { revalidatePath: () => {} },
    "@/lib/auth-profile-state": state,
    "@/lib/profile-capture": {
      startProfileCapture: async () => {
        allocations++;
        return {};
      },
    },
  });
  const req = (origin) =>
    new NextRequest("https://preflight.example.com/api/profiles/browser", {
      method: "POST",
      headers: { origin },
      body: JSON.stringify(input),
    });
  assert.equal((await route.POST(req("https://evil.example.com"))).status, 403);
  assert.equal(
    (await route.POST(req("https://preflight.example.com"))).status,
    401,
  );
  assert.equal(allocations, 0);
  user = { user: { githubId: "100" } };
  const response = await route.POST(req("https://preflight.example.com"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(allocations, 1);
});
test("interactive Browserbase sessions disable recording and logs and expire after ten minutes", async (t) => {
  const original = global.fetch,
    old = process.env.BROWSERBASE_API_KEY;
  process.env.BROWSERBASE_API_KEY = "private-api-key";
  let body;
  global.fetch = async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ id: "session" }));
  };
  t.after(() => {
    global.fetch = original;
    if (old === undefined) delete process.env.BROWSERBASE_API_KEY;
    else process.env.BROWSERBASE_API_KEY = old;
  });
  const bb = load("lib/browserbase.ts", {});
  await bb.createBrowserSession(true, true);
  assert.equal(body.keepAlive, true);
  assert.equal(body.timeout, 600);
  assert.deepEqual(body.browserSettings, {
    recordSession: false,
    logSession: false,
  });
});
