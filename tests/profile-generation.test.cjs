const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load-module.cjs");
const state = load("lib/auth-profile-state.ts", {});
function generation(mocks = {}) {
  return load("lib/profile-generation.ts", {
    "@/lib/db": { getSql: () => async () => [] },
    "@/lib/schema": {
      ensureSchema: async () => {},
      getProject: async () => ({ app_url: "https://app.example.com" }),
    },
    "@/lib/auth-profiles": { profileProject: async () => {} },
    "@/lib/auth-profile-state": state,
    ...mocks,
  });
}
test("generated accounts use unique test identities and owner/origin/capture-bound encryption", (t) => {
  const old = process.env.PROFILE_ENCRYPTION_KEY;
  process.env.PROFILE_ENCRYPTION_KEY = Buffer.alloc(32, 4).toString("base64");
  t.after(() =>
    old === undefined
      ? delete process.env.PROFILE_ENCRYPTION_KEY
      : (process.env.PROFILE_ENCRYPTION_KEY = old),
  );
  const api = generation(),
    account = api.testAccount();
  assert.match(account.email, /^preflight-[a-f0-9]{12}@example\.com$/);
  assert.ok(account.password.length >= 32);
  assert.notEqual(api.testAccount().email, account.email);
  assert.equal(api.testAccount("qa@example.org").email, "qa@example.org");
  assert.throws(() => api.testAccount("invalid"));
  const encrypted = api.sealTestAccount(
    account,
    "owner",
    "https://app.example.com",
    "capture-1",
  );
  assert.ok(!encrypted.includes(account.password));
  assert.deepEqual(
    api.openTestAccount(
      encrypted,
      "owner",
      "https://app.example.com",
      "capture-1",
    ),
    account,
  );
  for (const args of [
    ["other", "https://app.example.com", "capture-1"],
    ["owner", "https://other.example.com", "capture-1"],
    ["owner", "https://app.example.com", "capture-2"],
  ])
    assert.throws(() => api.openTestAccount(encrypted, ...args));
});
test("web generation only reserves encrypted credentials; no browser libraries or keys are needed", async (t) => {
  const old = process.env.PROFILE_ENCRYPTION_KEY;
  process.env.PROFILE_ENCRYPTION_KEY = Buffer.alloc(32, 4).toString("base64");
  t.after(() =>
    old === undefined
      ? delete process.env.PROFILE_ENCRYPTION_KEY
      : (process.env.PROFILE_ENCRYPTION_KEY = old),
  );
  let captured;
  const api = generation({
    "@/lib/db": {
      getSql:
        () =>
        async (parts, ...values) => {
          if (!parts.join("").includes("INSERT INTO profile_captures"))
            return [];
          captured = { query: parts.join("?"), values };
          return [
            {
              id: values[0],
              expires_at: new Date(Date.now() + 600000).toISOString(),
            },
          ];
        },
    },
  });
  const result = await api.startProfileGeneration("owner", 12, {});
  assert.ok(captured.values.includes("https://app.example.com"));
  assert.ok(captured.values.includes(12));
  assert.ok(!captured.query.includes("session_id"));
  assert.ok(!JSON.stringify(result).includes("liveUrl"));
  const encrypted = captured.values.find(
    (value) => typeof value === "string" && value.startsWith("v1."),
  );
  assert.match(
    api.openTestAccount(
      encrypted,
      "owner",
      "https://app.example.com",
      result.id,
    ).email,
    /@example\.com$/,
  );
});
test("live browser links are encrypted with a separate setup binding and validate their host", (t) => {
  const old = process.env.PROFILE_ENCRYPTION_KEY;
  process.env.PROFILE_ENCRYPTION_KEY = Buffer.alloc(32, 4).toString("base64");
  t.after(() =>
    old === undefined
      ? delete process.env.PROFILE_ENCRYPTION_KEY
      : (process.env.PROFILE_ENCRYPTION_KEY = old),
  );
  const api = generation(),
    url = "https://www.browserbase.com/devtools/private-test";
  const sealed = api.sealGenerationLiveUrl(
    url,
    "owner",
    "https://app.example.com",
    "capture",
  );
  assert.ok(!sealed.includes(url));
  assert.equal(
    api.openGenerationLiveUrl(
      sealed,
      "owner",
      "https://app.example.com",
      "capture",
    ),
    url,
  );
  assert.throws(() =>
    api.openGenerationLiveUrl(
      sealed,
      "other",
      "https://app.example.com",
      "capture",
    ),
  );
  assert.throws(() =>
    api.openGenerationLiveUrl(
      sealed,
      "owner",
      "https://app.example.com",
      "other-capture",
    ),
  );
  assert.throws(() =>
    api.openGenerationLiveUrl(
      api.sealGenerationLiveUrl(
        "https://evil.example.com/",
        "owner",
        "https://app.example.com",
        "capture",
      ),
      "owner",
      "https://app.example.com",
      "capture",
    ),
  );
});
test("status is owner/project scoped and never selects encrypted state or credentials", async () => {
  let query;
  const api = generation({
    "@/lib/db": {
      getSql:
        () =>
        async (parts, ...values) => {
          query = { text: parts.join("?"), values };
          return [
            {
              id: "capture",
              status: "completed",
              expires_at: new Date(Date.now() + 60000),
              automation_status: "running",
              profile_id: 7,
              name: "Test user",
              origin: "https://app.example.com",
              verification_path: "/dashboard",
              verification_text: "Sign out",
            },
          ];
        },
    },
  });
  const result = await api.getProfileGeneration("owner", 12);
  assert.equal(result.status, "completed");
  assert.equal(result.profile.id, 7);
  assert.ok(
    query.text.includes("c.owner_github_id=?") &&
      query.text.includes("c.project_id=?"),
  );
  assert.ok(
    !query.text.includes("encrypted_state") &&
      !query.text.includes("automation_credentials"),
  );
  assert.ok(query.values.includes("owner") && query.values.includes(12));
});
test("action executor uses server-held values and rejects password exfiltration and unrelated actions", async () => {
  const api = load("lib/profile-generation-browser.ts", {
    "@/lib/profile-capture": {},
    "@/lib/browser-auth": {},
    "@/lib/models": {},
  });
  const values = [],
    el = {
      fill: async (value) => values.push(value),
      click: async () => values.push("clicked"),
    };
  const account = { password: "private-password", email: "test@example.com" };
  const page = { url: () => "https://app.example.com/signup" };
  const view = {
    handles: [el],
    controls: [{ tag: "input", type: "password", label: "Password", href: "" }],
  };
  const action = { action: "fill", field: "password", index: 0 };
  await api.applySetupAction(
    page,
    view,
    action,
    account,
    "https://app.example.com",
  );
  assert.deepEqual(values, [account.password]);
  await assert.rejects(
    api.applySetupAction(
      page,
      { ...view, controls: [{ tag: "input", type: "text" }] },
      action,
      account,
      "https://app.example.com",
    ),
  );
  for (const label of ["Delete account", "Pay now", "Sign out", "Upgrade"])
    await assert.rejects(
      api.applySetupAction(
        page,
        { ...view, controls: [{ tag: "button", label, href: "" }] },
        { action: "click", index: 0 },
        account,
        "https://app.example.com",
      ),
    );
  assert.equal(
    await api.applySetupAction(
      page,
      {
        ...view,
        controls: [
          { tag: "a", label: "Google", href: "https://accounts.google.com" },
        ],
      },
      { action: "click", index: 0 },
      account,
      "https://app.example.com",
    ),
    "oauth",
  );
  let wait = 0;
  await api.applySetupAction(
    {
      waitForTimeout: async (ms) => {
        wait = ms;
      },
    },
    { handles: [], controls: [] },
    { action: "wait" },
    account,
    "https://app.example.com",
  );
  assert.equal(wait, 1000);
});
test("profile agent response rejects unsupported actions and handoff reasons", async () => {
  let reply = {
    action: "handoff",
    index: 0,
    field: "name",
    marker: "",
    reason: "captcha",
  };
  const api = load("lib/profile-generation-browser.ts", {
    "@/lib/profile-capture": {},
    "@/lib/browser-auth": {},
    "@/lib/models": { profileSetupJson: async () => reply },
  });
  assert.equal((await api.decideSetup({})).reason, "captcha");
  reply = { ...reply, reason: "__proto__" };
  await assert.rejects(api.decideSetup({}));
  reply = { ...reply, action: "goto" };
  await assert.rejects(api.decideSetup({}));
});
test("setup snapshots omit input values and redact credentials before truncating text", async () => {
  const browserAuth = load("lib/browser-auth.ts", {});
  const api = load("lib/profile-generation-browser.ts", {
    "@/lib/profile-capture": {},
    "@/lib/browser-auth": browserAuth,
    "@/lib/models": {},
  });
  const account = {
    password: "Pf!generated-password-never-for-the-model",
    email: "qa@example.org",
    name: "QA",
    username: "qa",
  };
  const token = "private-session-cookie";
  const handle = {
    isVisible: async () => true,
    evaluate: async () => ({
      tag: "input",
      type: "password",
      label: "x".repeat(150) + account.password,
      href: "",
    }),
  };
  const page = {
    url: () => "https://app.example.com/signup",
    context: () => ({
      storageState: async () => ({ cookies: [{ value: token }], origins: [] }),
    }),
    locator: (selector) =>
      selector === "body"
        ? {
            innerText: async () =>
              `${token}\n${"x".repeat(9980)}${account.password}`,
          }
        : { elementHandles: async () => [handle] },
  };
  const view = await api.setupView(page, account);
  const input = JSON.stringify(view.input);
  assert.ok(!input.includes(token));
  assert.ok(!input.includes(account.password.slice(0, 8)));
  assert.ok(!input.includes('"value"'));
  assert.ok(view.input.text.includes("[redacted]"));
});
test("generation API gates writes before browser allocation, uses credential-free task payloads and cancels failed queues", async () => {
  const { NextRequest } = require("next/server");
  let user = null,
    denied = false,
    queueFails = false;
  const calls = [];
  const route = load("app/api/profiles/generate/route.ts", {
    "@/auth": { auth: async () => user },
    "next/cache": { revalidatePath() {} },
    "@/lib/auth-profile-state": state,
    "@/lib/auth-profiles": {
      profileProject: async () => {
        if (denied) throw new state.ProfileError("Project unavailable");
      },
    },
    "@/lib/trigger-client": {
      getTriggerClientConfig: () => ({ accessToken: "private-key" }),
    },
    "@trigger.dev/sdk": {
      tasks: {
        trigger: async (...args) => {
          calls.push(["task", ...args]);
          if (queueFails) throw new Error("private-error");
        },
      },
    },
    "@/lib/profile-generation": {
      startProfileGeneration: async (...args) => {
        calls.push(["start", ...args]);
        return { id: "capture" };
      },
      getProfileGeneration: async () => ({ id: "capture", status: "queued" }),
      failGenerationQueue: async (...args) => calls.push(["cleanup", ...args]),
    },
  });
  const request = (origin = "https://preflight.example.com") =>
    new NextRequest(
      "https://preflight.example.com/api/profiles/generate?projectId=12",
      {
        method: "POST",
        headers: { origin },
        body: JSON.stringify({ email: "test@example.com" }),
      },
    );
  assert.equal(
    (await route.POST(request("https://other.example.com"))).status,
    403,
  );
  assert.equal((await route.POST(request())).status, 401);
  assert.equal(calls.length, 0);
  user = { user: { githubId: "owner" } };
  denied = true;
  assert.equal((await route.POST(request())).status, 400);
  assert.equal(calls.length, 0);
  denied = false;
  const response = await route.POST(request());
  assert.equal(response.status, 202);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(calls.find((c) => c[0] === "task")[2], {
    owner: "owner",
    projectId: 12,
    captureId: "capture",
  });
  queueFails = true;
  const failure = await route.POST(request());
  assert.equal(failure.status, 400);
  assert.ok(!JSON.stringify(await failure.json()).includes("private-error"));
  assert.ok(calls.some((c) => c[0] === "cleanup"));
});
