const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load-module.cjs");
const response = load("lib/profile-setup-response.ts", {});

test("empty, truncated and gateway responses produce retryable messages without JSON parser errors", async () => {
  for (const [status, body] of [
    [200, ""],
    [502, ""],
    [504, "Gateway timeout"],
    [500, "<html>private upstream details</html>"],
    [200, '{"generation":'],
  ]) {
    await assert.rejects(
      response.readProfileSetupResponse(new Response(body, { status })),
      (error) => {
        assert.ok(error instanceof response.ProfileSetupResponseError);
        assert.equal(error.status, status);
        assert.equal(error.retryable, true);
        assert.ok(
          !/Unexpected|private upstream|SyntaxError/.test(error.message),
        );
        return true;
      },
    );
  }
  await assert.rejects(
    response.readProfileSetupResponse(Response.json({})),
    /incomplete response/,
  );
});

test("valid profile responses are preserved, while server validation and sign-in errors are not retried", async () => {
  assert.deepEqual(
    await response.readProfileSetupResponse(
      Response.json({ generation: null }),
    ),
    { generation: null },
  );
  const generation = {
    id: "capture",
    status: "running",
    expiresAt: Date.now() + 60000,
    message: "Creating test account",
  };
  assert.deepEqual(
    await response.readProfileSetupResponse(Response.json({ generation })),
    { generation },
  );
  for (const status of [400, 401, 403])
    await assert.rejects(
      response.readProfileSetupResponse(
        Response.json({ error: "Sign in again." }, { status }),
      ),
      (error) =>
        error.message === "Sign in again." && error.retryable === false,
    );
});

test("concurrent and warm status checks share one schema initialization, but project ownership remains fresh", async () => {
  const queries = [];
  const sql = async (parts, ...values) => {
    const query = parts.join("?");
    queries.push(query);
    return /^\s*SELECT/.test(query)
      ? [{ id: values[0], owner_github_id: values[1] }]
      : [];
  };
  const schema = load("lib/schema.ts", { "@/lib/db": { getSql: () => sql } });
  await Promise.all(Array.from({ length: 20 }, () => schema.ensureSchema()));
  const count = queries.length;
  assert.ok(count > 0);
  assert.equal(
    queries.filter((q) => q.includes("CREATE TABLE IF NOT EXISTS projects ("))
      .length,
    1,
  );
  await schema.ensureSchema();
  assert.equal(queries.length, count);
  assert.equal((await schema.getProject(7, "owner")).owner_github_id, "owner");
  assert.equal((await schema.getProject(7, "other")).owner_github_id, "other");
  assert.equal(
    queries.length,
    count + 2,
    "warm reads issue only their data queries, not migration batches",
  );
});

test("failed schema initialization can recover on the next request", async () => {
  let fail = true,
    starts = 0;
  const schema = load("lib/schema.ts", {
    "@/lib/db": {
      getSql: () => async (parts) => {
        if (parts.join("").includes("CREATE TABLE IF NOT EXISTS projects ("))
          starts++;
        if (fail) throw new Error("temporary database outage");
        return [];
      },
    },
  });
  const results = await Promise.allSettled([
    schema.ensureSchema(),
    schema.ensureSchema(),
  ]);
  assert.ok(results.every((r) => r.status === "rejected"));
  assert.equal(starts, 1);
  fail = false;
  await schema.ensureSchema();
  assert.equal(starts, 2);
  await schema.ensureSchema();
  assert.equal(starts, 2);
});

test("initial profile status reads do not load queue configuration and auth failures still return JSON", async () => {
  const { NextRequest } = require("next/server");
  let mode = "ok";
  const route = load("app/api/profiles/generate/route.ts", {
    "@/auth": {
      auth: async () => {
        if (mode === "throw") throw new Error("private auth diagnostic");
        return mode === "missing" ? null : { user: { githubId: "owner" } };
      },
    },
    "@/lib/auth-profile-state": { ProfileError: class extends Error {} },
    "@/lib/auth-profiles": { profileProject: async () => {} },
    "@/lib/trigger-client": {
      getTriggerClientConfig: () => {
        throw new Error("Queue must not load on a status read");
      },
    },
    "@/lib/profile-generation": { getProfileGeneration: async () => null },
    "next/cache": { revalidatePath() {} },
  });
  const request = () =>
    new NextRequest("https://preflight.test/api/profiles/generate?projectId=7");
  assert.deepEqual(await (await route.GET(request())).json(), {
    generation: null,
  });
  mode = "missing";
  assert.equal((await route.GET(request())).status, 401);
  mode = "throw";
  const failure = await route.GET(request());
  assert.equal(failure.status, 500);
  assert.equal(failure.headers.get("cache-control"), "no-store");
  const body = await failure.json();
  assert.ok(body.error && !body.error.includes("private auth"));
});

test("start reports missing queue configuration before reserving a setup, and database failures expose only a safe code", async (t) => {
  const { NextRequest } = require("next/server");
  const state = load("lib/auth-profile-state.ts", {});
  t.mock.method(console, "error", () => {});
  let reserved = 0,
    configMissing = true;
  const route = load("app/api/profiles/generate/route.ts", {
    "@/auth": { auth: async () => ({ user: { githubId: "owner" } }) },
    "@/lib/auth-profile-state": state,
    "@/lib/auth-profiles": { profileProject: async () => {} },
    "@/lib/trigger-client": {
      getTriggerClientConfig: () => {
        if (configMissing)
          throw new Error(
            "TRIGGER_SECRET_KEY is missing from the web app environment.",
          );
        return {};
      },
    },
    "@trigger.dev/sdk": { tasks: {} },
    "@/lib/profile-generation": {
      startProfileGeneration: async () => {
        reserved++;
        throw Object.assign(new Error("private database connection details"), {
          code: "42P18",
        });
      },
    },
    "next/cache": { revalidatePath() {} },
  });
  const request = () =>
    new NextRequest(
      "https://preflight.test/api/profiles/generate?projectId=7",
      {
        method: "POST",
        headers: { origin: "https://preflight.test" },
        body: "{}",
      },
    );
  const config = await route.POST(request());
  assert.equal(config.status, 400);
  assert.match((await config.json()).error, /TRIGGER_SECRET_KEY/);
  assert.equal(reserved, 0);
  configMissing = false;
  const database = await route.POST(request());
  assert.equal(database.status, 500);
  const body = await database.json();
  assert.match(body.error, /PROFILE_RESERVE\/42P18/);
  assert.ok(!JSON.stringify(body).includes("private database"));
});
