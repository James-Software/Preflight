const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load-module.cjs");
const { safeReturnTo } = load("lib/return-to.ts", {
  "./site": { SITE_URL: "https://www.trypreflight.dev" },
});
test("login preserves an internal deep link, including query parameters", () => {
  assert.equal(
    safeReturnTo("/dashboard/admin/blog/new?from=menu"),
    "/dashboard/admin/blog/new?from=menu",
  );
  assert.equal(
    safeReturnTo("https://www.trypreflight.dev/dashboard/projects/12/runs/34"),
    "/dashboard/projects/12/runs/34",
  );
});
test("login rejects external, malformed, or non-dashboard destinations", () => {
  for (const value of [
    "https://attacker.example/dashboard",
    "//attacker.example/dashboard",
    "/\\attacker.example/dashboard",
    "/dashboard/../../login",
    "/dashboard-evil",
    "javascript:alert(1)",
    "/login",
    undefined,
    ["ignored"],
    "/dashboard\nmalformed",
  ])
    assert.equal(safeReturnTo(value), "/dashboard");
});
test("an inaccessible run never queries findings or diagnosis artifacts", async () => {
  const calls = [];
  const sql = async (parts, ...values) => {
    calls.push({ query: parts.join("?"), values });
    return [];
  };
  const { getRunReport } = load("lib/schema.ts", {
    "@/lib/db": { getSql: () => sql },
  });
  assert.equal(await getRunReport(12, 34, "owner-100"), null);
  const reads = calls.filter((call) => /^\s*SELECT/i.test(call.query));
  assert.equal(reads.length, 1);
  assert.match(reads[0].query, /p\.owner_github_id = \?/);
  assert.match(reads[0].query, /r\.project_id = \?/);
  assert.deepEqual(reads[0].values, [34, 12, "owner-100", "owner-100"]);
});
test("run summaries fetch finding counts with the initial history query", async () => {
  let query;
  const sql = async (parts) => {
    const text = parts.join("?");
    if (/SELECT id, project_id/.test(text)) {
      query = text;
      return [{ id: 34, findingsCount: 3 }];
    }
    return [];
  };
  const { listRuns } = load("lib/schema.ts", {
    "@/lib/db": { getSql: () => sql },
  });
  const rows = await listRuns(12);
  assert.equal(rows[0].findingsCount, 3);
  assert.match(
    query,
    /COUNT\(\*\)::int FROM findings WHERE findings\.run_id = runs\.id/,
  );
});
function reportPage(user, getProject, getRunReport) {
  return load("app/dashboard/projects/[id]/runs/[runId]/page.tsx", {
    "@/auth": { auth: async () => (user ? { user } : null) },
    "next/navigation": {
      redirect: (url) => {
        throw Object.assign(new Error("redirect"), { url });
      },
      notFound: () => {
        throw new Error("not-found");
      },
    },
    "@/lib/schema": { getProject, getRunReport },
    "@/components/GitIcons": load("components/GitIcons.tsx", {}),
    "@/components/RunReportRefresh": { default: () => null },
    "@/components/CopyRunDetails": { default: () => null },
    "@/lib/run-details": load("lib/run-details.ts", {}),
    "@/components/FixesTable": { default: () => null },
    "@/components/ProjectLogo": { default: () => null },
    "@/components/RunArchiveButton": { default: () => null },
    "@/components/DatabaseCleanup": { default: () => null },
    "@/components/TestStepResults": { default: () => null },
    "@/components/DatabaseCheckResults": { default: () => null },
  }).default;
}
test("report redirects a signed-out visitor back through the same run URL", async () => {
  const page = reportPage(
    null,
    () => assert.fail("must not read projects"),
    () => assert.fail("must not read reports"),
  );
  await assert.rejects(
    page({ params: Promise.resolve({ id: "12", runId: "34" }) }),
    (error) =>
      error.url ===
      "/login?callbackUrl=%2Fdashboard%2Fprojects%2F12%2Fruns%2F34",
  );
});
test("report validates IDs and project ownership before reading artifacts", async () => {
  const invalid = reportPage(
    { githubId: "100" },
    () => assert.fail("invalid IDs must not query"),
    () => assert.fail("must not query"),
  );
  await assert.rejects(
    invalid({ params: Promise.resolve({ id: "12", runId: "NaN" }) }),
    /not-found/,
  );
  const otherOwner = reportPage(
    { githubId: "100" },
    async () => null,
    () => assert.fail("must not read another owner’s report"),
  );
  await assert.rejects(
    otherOwner({ params: Promise.resolve({ id: "12", runId: "34" }) }),
    /not-found/,
  );
});
test("updating an app URL remains scoped to its owner", async () => {
  let update;
  const sql = async (parts, ...values) => {
    if (parts.join("").includes("UPDATE projects")) {
      update = { query: parts.join("?"), values };
      return [];
    }
    return [];
  };
  const { updateProjectAppUrl } = load("lib/schema.ts", {
    "@/lib/db": { getSql: () => sql },
  });
  assert.equal(
    await updateProjectAppUrl(12, "other-owner", "https://example.com"),
    false,
  );
  assert.match(update.query, /owner_github_id = \?/);
  assert.deepEqual(update.values, ["https://example.com", 12, "other-owner"]);
});

const { getTriggerClientConfig, swarmStartError } = load(
  "lib/trigger-client.ts",
  {},
);
test("production rejects a Preview/Development Trigger key before queuing a swarm", () => {
  for (const key of ["tr_preview_test", "tr_dev_test"]) {
    assert.throws(
      () =>
        getTriggerClientConfig({
          VERCEL_ENV: "production",
          TRIGGER_SECRET_KEY: key,
        }),
      /Production TRIGGER_SECRET_KEY/,
    );
  }
  assert.throws(
    () => getTriggerClientConfig({}),
    /TRIGGER_SECRET_KEY is missing/,
  );
  assert.throws(
    () => getTriggerClientConfig({ TRIGGER_SECRET_KEY: "tr_preview_test" }),
    /matching a deployed Trigger.dev branch/,
  );
});
test("the installed Trigger SDK sends only the intended worker branch", async (t) => {
  const { tasks } = require("@trigger.dev/sdk");
  const previous = process.env.VERCEL_GIT_COMMIT_REF;
  process.env.VERCEL_GIT_COMMIT_REF = "unrelated-vercel-branch";
  t.after(() => {
    if (previous === undefined) delete process.env.VERCEL_GIT_COMMIT_REF;
    else process.env.VERCEL_GIT_COMMIT_REF = previous;
  });
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.match(String(url), /\/api\/v1\/tasks\/run-swarm\/trigger$/);
    calls.push(new Headers(options.headers));
    return Response.json({ id: "run_test" });
  });
  for (const [env, expectedBranch] of [
    [
      {
        TRIGGER_SECRET_KEY: "tr_prod_test",
        VERCEL_GIT_COMMIT_REF: "main",
        TRIGGER_PREVIEW_BRANCH: "stale-preview",
      },
      null,
    ],
    [
      { TRIGGER_SECRET_KEY: "tr_dev_test", VERCEL_GIT_COMMIT_REF: "main" },
      null,
    ],
    [
      { TRIGGER_SECRET_KEY: "tr_dev_test", TRIGGER_DEV_BRANCH: "default" },
      null,
    ],
    [
      { TRIGGER_SECRET_KEY: "tr_dev_test", TRIGGER_DEV_BRANCH: "worker-dev" },
      "worker-dev",
    ],
    [
      {
        TRIGGER_SECRET_KEY: "tr_preview_test",
        VERCEL_GIT_COMMIT_REF: "feature/qa",
      },
      "feature/qa",
    ],
    [
      {
        TRIGGER_SECRET_KEY: "tr_preview_test",
        TRIGGER_PREVIEW_BRANCH: "explicit-preview",
        VERCEL_GIT_COMMIT_REF: "feature/qa",
      },
      "explicit-preview",
    ],
  ]) {
    await tasks.trigger(
      "run-swarm",
      { runId: 1, targetUrl: "https://example.com" },
      undefined,
      { clientConfig: getTriggerClientConfig(env) },
    );
    assert.equal(calls.at(-1).get("x-trigger-branch"), expectedBranch);
    assert.equal(
      calls.at(-1).get("authorization"),
      `Bearer ${env.TRIGGER_SECRET_KEY}`,
    );
  }
  assert.equal(calls.length, 6);
});
test("branch environment errors explain how to recover", () => {
  const message = swarmStartError(new Error("No matching branch env"));
  assert.match(message, /Production TRIGGER_SECRET_KEY/);
  assert.match(message, /deploy the matching branch/);
});
function swarmRoute(trigger, config, changes = {}) {
  return load("app/api/projects/[id]/runs/route.ts", {
    "@/lib/project-github": { projectGithubContext: async()=>null, ProjectGithubError: class extends Error{} },
    "@trigger.dev/sdk": { tasks: { trigger } },
    "@/auth": { auth: async () => ({ user: { githubId: "owner-100" } }) },
    "@/lib/trigger-client": { getTriggerClientConfig: config, swarmStartError },
    "@/lib/schema": {
      getProject: async () => ({ id: 12, app_url: "https://example.com" }),
      createRun: async () => ({ id: 34 }),
      updateRunStatus: async () => {},
      ...changes,
    },
    "@/lib/github": {},
    "@/lib/auth-profiles": {},
    "@/lib/database-connections": {},
    "@/lib/database-check-config": {},
    "@/lib/github-credentials": {
      GithubRenewalUnavailable: class extends Error {},
    },
    "@/lib/auth-profile-state": {},
    "@/lib/run-targets": {},
  });
}
test("invalid worker configuration creates no queued run", async () => {
  const route = swarmRoute(
    () => assert.fail("must not trigger"),
    () => {
      throw new Error("Production TRIGGER_SECRET_KEY required");
    },
    { createRun: () => assert.fail("must not create a run") },
  );
  const response = await route.POST(
    new Request("https://example.com/api/projects/12/runs", {
      method: "POST",
      headers: { origin: "https://example.com" },
    }),
    { params: Promise.resolve({ id: "12" }) },
  );
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /Production TRIGGER_SECRET_KEY/);
});
test("swarm startup passes worker routing per request", async () => {
  const config = { accessToken: "tr_prod_test", previewBranch: "" };
  let triggered;
  const route = swarmRoute(
    async (...args) => {
      triggered = args;
    },
    () => config,
  );
  const response = await route.POST(
    new Request("https://example.com/api/projects/12/runs", {
      method: "POST",
      headers: { origin: "https://example.com" },
    }),
    { params: Promise.resolve({ id: "12" }) },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(triggered, [
    "run-swarm",
    { runId: 34, targetUrl: "https://example.com" },
    undefined,
    { clientConfig: config },
  ]);
});
test("the explicit OpenRouter chat fallback still uses its own key and endpoint", async (t) => {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "router-test";
  t.after(() => {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  });
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(
      new Headers(options.headers).get("authorization"),
      "Bearer router-test",
    );
    assert.equal(JSON.parse(options.body).model, "openai/gpt-4o-mini");
    return Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({ verdict: "pass", confidence: 0.9 }),
          },
        },
      ],
    });
  });
  const { judgeStep } = load("lib/models.ts", {
    "@/lib/openai-decisions": {},
    "@/lib/model-config": {
      MODEL_CONFIG: {
        judge: { provider: "openrouter-chat", model: "openai/gpt-4o-mini" },
      },
    },
  });
  assert.deepEqual(
    await judgeStep({
      stepTitle: "Checkout",
      stepDetail: "Pay",
      observation: "Success",
    }),
    { verdict: "pass", confidence: 0.9 },
  );
});
test("a missing remote worker branch fails the run and returns recovery instructions", async (t) => {
  const updates = [];
  t.mock.method(console, "error", () => {});
  const route = swarmRoute(
    async () => {
      throw new Error("No matching branch env");
    },
    () => ({ accessToken: "tr_preview_test", previewBranch: "feature/qa" }),
    { updateRunStatus: async (...args) => updates.push(args) },
  );
  const response = await route.POST(
    new Request("https://example.com/api/projects/12/runs", {
      method: "POST",
      headers: { origin: "https://example.com" },
    }),
    { params: Promise.resolve({ id: "12" }) },
  );
  assert.equal(response.status, 500);
  assert.deepEqual(updates, [
    [
      34,
      "failed",
      "The run could not be queued. Check the worker deployment configuration.",
    ],
  ]);
  assert.match((await response.json()).error, /deploy the matching branch/);
});
