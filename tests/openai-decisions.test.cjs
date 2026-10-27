const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load-module.cjs");

const transport = load("lib/openai-decisions.ts", {});
const question = {
  type: "predicate",
  name: "step_ok",
  instructions: "Did checkout succeed?",
};
const request = { model: "gpt-6-luna", input: "Checkout failed", question };
// Canonical response shape: OpenAI's official openai-node Decisions resource.
const predicate = (probability) => ({
  model: "gpt-6-luna",
  answers: [{ type: "predicate", name: "step_ok", probability }],
  usage: {
    input_tokens: 42,
    input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
    output_tokens: 0,
    output_tokens_details: { reasoning_tokens: 0 },
    total_tokens: 42,
  },
});
function env(t, values) {
  const old = {};
  for (const [key, value] of Object.entries(values)) {
    old[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}
function models() {
  return load("lib/models.ts", {
    "@/lib/model-config": {
      MODEL_CONFIG: {
        driver: { model: "openai/gpt-5.6-luna" },
        judge: { provider: "openai-decisions", model: "gpt-6-luna" },
      },
    },
    "@/lib/openai-decisions": transport,
  });
}

test("OpenAI Decisions is the default judge with its documented supported model", (t) => {
  env(t, { JUDGE_PROVIDER: undefined, JUDGE_MODEL: undefined });
  const config = load("lib/model-config.ts", {
    "@/lib/openai-decisions": transport,
  });
  assert.deepEqual(config.MODEL_CONFIG.judge, {
    provider: "openai-decisions",
    model: "gpt-6-luna",
  });
  assert.equal(config.MODEL_CONFIG.driver.provider, "openrouter-chat");
});
test("pass/fail uses the OpenAI endpoint, bearer key and predicate contract", async (t) => {
  env(t, { OPENAI_API_KEY: "openai-test-key", OPENROUTER_API_KEY: undefined });
  let result = predicate(0.9);
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/decisions");
    assert.equal(options.method, "POST");
    assert.equal(
      new Headers(options.headers).get("authorization"),
      "Bearer openai-test-key",
    );
    assert.ok(options.signal instanceof AbortSignal);
    const body = JSON.parse(options.body);
    assert.equal(body.model, "gpt-6-luna");
    assert.equal(typeof body.input, "string");
    assert.equal(body.questions.length, 1);
    assert.equal(body.questions[0].type, "predicate");
    assert.equal(body.questions[0].name, "step_ok");
    assert.equal(Object.hasOwn(body, "state"), false);
    calls.push(body);
    return Response.json(result);
  });
  const { judgeStep } = models();
  const input = {
    stepTitle: "Checkout",
    stepDetail: "Pay",
    observation: "Success",
  };
  assert.deepEqual(await judgeStep(input), {
    verdict: "pass",
    confidence: 0.9,
  });
  result = predicate(0.1);
  assert.deepEqual(await judgeStep(input), {
    verdict: "fail",
    confidence: 0.9,
  });
  result = predicate(0);
  assert.deepEqual(await judgeStep(input), { verdict: "fail", confidence: 1 });
  assert.equal(calls.length, 3);
});
test("severity uses choices and preserves the API's confidence, including zero", async (t) => {
  env(t, { OPENAI_API_KEY: "openai-test-key" });
  let confidence = 0.93;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const q = JSON.parse(options.body).questions[0];
    assert.equal(q.type, "choice");
    assert.equal(q.name, "severity");
    assert.deepEqual(
      q.choices.map((c) => c.value),
      ["low", "medium", "high", "critical"],
    );
    assert.ok(q.choices.every((c) => typeof c.description === "string"));
    return Response.json({
      answers: [
        {
          type: "choice",
          name: "severity",
          choice: "high",
          probabilities: [{ value: "high", probability: 0.93 }],
          confidence,
        },
      ],
    });
  });
  const { assessSeverity } = models();
  const input = { title: "Checkout broken", detail: "Pay does nothing" };
  assert.deepEqual(await assessSeverity(input), {
    severity: "high",
    confidence: 0.93,
  });
  confidence = 0;
  assert.deepEqual(await assessSeverity(input), {
    severity: "high",
    confidence: 0,
  });
});
test("finding assessment distinguishes blocked and unconfirmed evidence from application defects", async (t) => {
  env(t, { OPENAI_API_KEY: "openai-test-key" });
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const q = JSON.parse(options.body).questions[0];
    assert.equal(q.name, "finding_evidence");
    assert.deepEqual(
      q.choices.map((c) => c.value),
      ["application_bug", "blocked", "needs_review", "pass"],
    );
    assert.match(
      q.instructions,
      /401.*does NOT prove the app session was lost/,
    );
    return Response.json({
      answers: [
        { type: "choice", name: q.name, choice: "blocked", confidence: 0.98 },
      ],
    });
  });
  assert.deepEqual(
    await models().assessFinding("GitHub connection unavailable"),
    { category: "blocked", confidence: 0.98 },
  );
});
test("missing credentials or unsupported model never send a request", async (t) => {
  env(t, { OPENAI_API_KEY: undefined });
  t.mock.method(globalThis, "fetch", () => assert.fail("must not call OpenAI"));
  await assert.rejects(
    transport.askOpenAIDecision(request),
    /OPENAI_API_KEY.*Trigger.dev/,
  );
  await assert.rejects(
    transport.askOpenAIDecision({ ...request, model: "openai/gpt-4o-mini" }),
    /supports gpt-6-luna/,
  );
});
test("refusals, wrong questions and malformed probabilities never become passes", async (t) => {
  env(t, { OPENAI_API_KEY: "openai-test-key" });
  let body;
  t.mock.method(globalThis, "fetch", async () => Response.json(body));
  for (const answers of [
    [],
    [{ type: "refusal", name: "step_ok" }],
    [{ type: "predicate", name: "other", probability: 0.9 }],
    [{ type: "predicate", name: "step_ok", probability: "0.9" }],
    [{ type: "predicate", name: "step_ok", probability: null }],
    [{ type: "predicate", name: "step_ok", probability: -0.1 }],
    [{ type: "predicate", name: "step_ok", probability: 1.1 }],
    [{ type: "choice", name: "step_ok", choice: "pass", confidence: 0.9 }],
    [
      { type: "predicate", name: "step_ok", probability: 0.9 },
      { type: "predicate", name: "step_ok", probability: 0.9 },
    ],
  ]) {
    body = { answers };
    await assert.rejects(
      transport.askOpenAIDecision(request),
      /OpenAI Decisions/,
    );
  }
});
test("unknown severity or invalid confidence cannot silently become medium", async (t) => {
  env(t, { OPENAI_API_KEY: "openai-test-key" });
  let answer;
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ answers: [answer] }),
  );
  const q = {
    type: "choice",
    name: "severity",
    instructions: "Severity?",
    choices: [{ value: "low" }, { value: "high" }],
  };
  for (const [choice, confidence] of [
    ["unknown", 0.9],
    [true, 0.9],
    ["high", "0.9"],
    ["high", 1.1],
  ]) {
    answer = { type: "choice", name: "severity", choice, confidence };
    await assert.rejects(
      transport.askOpenAIDecision({ ...request, question: q }),
      /OpenAI Decisions/,
    );
  }
});
test("transient failures retry, authentication errors do not, and private bodies stay private", async (t) => {
  env(t, { OPENAI_API_KEY: "openai-test-key" });
  const waits = [];
  const client = load("lib/openai-decisions.ts", {
    "node:timers/promises": { setTimeout: async (ms) => waits.push(ms) },
  });
  let statuses = [429, 503, 200],
    calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    const status = statuses.shift();
    return status === 200
      ? Response.json(predicate(0.9))
      : Response.json(
          { error: { message: "private-input-and-secret" } },
          { status },
        );
  });
  assert.equal((await client.askOpenAIDecision(request)).probability, 0.9);
  assert.equal(calls, 3);
  assert.deepEqual(waits, [500, 1000]);
  statuses = [401];
  calls = 0;
  await assert.rejects(
    client.askOpenAIDecision(request),
    (error) => error.message === "OpenAI Decisions API error 401",
  );
  assert.equal(calls, 1);
  statuses = [503, 503, 503];
  calls = 0;
  await assert.rejects(client.askOpenAIDecision(request), /API error 503/);
  assert.equal(calls, 3);
});

function parentTask({
  validate = () => {},
  agents = [{ ok: true }],
  status = "queued",
  findings = 0,
  observed = 0,
  incomplete = 0,
} = {}) {
  const statuses = [],
    reasons = [],
    recorded = [];
  let batches = 0;
  const task = load("src/trigger/run-swarm.ts", {
    "@/lib/run-details": load("lib/run-details.ts", {}),
    "@/lib/run-authentication": { renewRunAuthentication: async () => false },
    "@/lib/automatic-database": {
      preflightAutomaticDatabase: async () => true,
    },
    "@/lib/database-verification": {},
    "@/lib/auth-profiles": {},
    "@trigger.dev/sdk": {
      task: (options) => options,
      tasks: {
        batchTriggerAndWait: async () => {
          batches++;
          return { runs: agents };
        },
      },
    },
    "@/lib/db": {
      getSql: () => async (parts) => {
        const q = parts.join("");
        if (q.includes("COUNT")) {
          if (q.includes("FROM run_test_results"))
            return [{ observed, incomplete }];
          if (q.includes("FROM run_database_checks"))
            return [{ observed: 0, incomplete: 0 }];
          return [{ c: findings }];
        }
        return [
          {
            id: 34,
            status,
            plan: [{ title: "Checkout", detail: "Pay" }],
            target_url: "https://example.com",
          },
        ];
      },
    },
    "@/lib/schema": {
      updateRunStatus: async (_id, value, reason) => {
        statuses.push(value);
        reasons.push(reason);
      },
      recordTestResult: async (...args) => recorded.push(args),
    },
    "@/lib/model-config": { assertSwarmModelConfig: validate },
  }).runSwarm;
  return {
    run: () => task.run({ runId: 34 }),
    statuses,
    reasons,
    recorded,
    batches: () => batches,
  };
}
test("missing worker OpenAI key fails before planning or allocating browser agents", async () => {
  const parent = parentTask({
    validate: () => {
      throw new Error("OPENAI_API_KEY is not set");
    },
  });
  await assert.rejects(parent.run(), /OPENAI_API_KEY/);
  assert.deepEqual(parent.statuses, ["failed"]);
  assert.equal(parent.batches(), 0);
});
test("one failed browser agent preserves successful work as a partial run", async () => {
  const parent = parentTask({
    agents: [
      { ok: true },
      { ok: false, error: { message: "OpenAI Decisions API error 403" } },
    ],
  });
  assert.equal((await parent.run()).status, "partial");
  assert.deepEqual(parent.statuses, ["running", "partial"]);
  assert.match(parent.reasons.at(-1), /HTTP 403/);
  assert.ok(parent.recorded.every((args) => args[3] === false));
  const success = parentTask();
  assert.equal((await success.run()).findings, 0);
  assert.deepEqual(success.statuses, ["running", "done"]);
});

test("all failed workers remain a genuine failure unless completed observations were saved", async () => {
  const failed = parentTask({
    agents: [{ ok: false, error: { message: "private-secret-detail" } }],
  });
  await assert.rejects(failed.run(), /No browser checks completed/);
  assert.equal(failed.statuses.at(-1), "failed");
  assert.ok(!failed.reasons.at(-1).includes("private-secret-detail"));
  const partial = parentTask({
    agents: [{ ok: false, error: { message: "driver unavailable" } }],
    findings: 2,
  });
  const result = await partial.run();
  assert.equal(result.status, "partial");
  assert.equal(result.findings, 2);
});
test("unconfirmed checks finish partially without becoming bugs or requiring review", async () => {
  const run = parentTask({ observed: 2, incomplete: 2 });
  const result = await run.run();
  assert.equal(result.status, "partial");
  assert.equal(result.findings, 0);
});
test("cancelled runs skip model validation and never allocate browsers", async () => {
  const parent = parentTask({
    status: "cancelled",
    validate: () => assert.fail("must not validate a dead run"),
  });
  assert.equal((await parent.run()).status, "skipped");
  assert.equal(parent.batches(), 0);
});

function browserTask({ verdictError = false, severityError = false } = {}) {
  const statuses = [],
    closed = [];
  const page = {
    url: () => "https://example.com",
    on: () => {},
    goto: async () => {},
    screenshot: async () => Buffer.from("test-image"),
    locator: () => ({ ariaSnapshot: async () => "button Pay" }),
  };
  const task = load("src/trigger/browser-agent.ts", {
    "@/lib/db": {},
    "@/lib/check-investigation": load("lib/check-investigation.ts", {"@/lib/finding-evidence": load("lib/finding-evidence.ts", {})}),
    "@/lib/finding-evidence": load("lib/finding-evidence.ts", {}),
    "@/lib/automatic-database": {},
    "@/lib/database-verification": {},
    "@/lib/database-check-config": {},
    "@/lib/auth-profiles": {},
    "@/lib/browser-auth": {},
    "@trigger.dev/sdk": { task: (options) => options },
    "playwright-core": {
      chromium: {
        connectOverCDP: async () => ({
          newPage: async () => page,
          close: async () => {},
        }),
      },
    },
    "@/lib/browserbase": {
      createBrowserSession: async () => ({
        id: "session-test",
        connectUrl: "test",
      }),
      closeBrowserSession: async (id) => closed.push(id),
    },
    "@/lib/models": {
      driverDecide: async () => ({
        action: "done",
        reasoning: "Checkout attempted",
      }),
      judgeStep: async () => {
        if (verdictError) throw new Error("OpenAI Decisions API error 403");
        return { verdict: "fail" };
      },
      assessSeverity: async () => {
        if (severityError)
          throw new Error("OpenAI Decisions declined to judge this input");
        return { severity: "high", confidence: 0.9 };
      },
    },
    "@/lib/model-config": {
      MODEL_CONFIG: { judge: { provider: "openai-decisions" } },
    },
    "@/lib/evidence": {
      uploadScreenshot: async () => "https://example.com/evidence.jpg",
    },
    "@/lib/schema": {
      createAgent: async () => ({ id: 56 }),
      updateAgentStatus: async (_id, status) => statuses.push(status),
      createFinding: async () => {},
      recordTestResult: async () => {},
    },
  }).browserAgent;
  return {
    run: () =>
      task.run({
        runId: 34,
        agentIndex: 0,
        assignment: { steps: [{ title: "Checkout", detail: "Pay" }] },
        appUrl: "https://example.com",
      }),
    statuses,
    closed,
  };
}
test("failed step judgments fail the browser agent and close its cloud session", async () => {
  for (const options of [{ verdictError: true }]) {
    const task = browserTask(options);
    await assert.rejects(task.run(), /OpenAI Decisions/);
    assert.deepEqual(task.statuses, ["running", "failed"]);
    assert.deepEqual(task.closed, ["session-test"]);
  }
});
test("a failing step verdict alone cannot create an application finding", async () => {
  const task = browserTask();
  assert.equal((await task.run()).findings, 0);
  assert.deepEqual(task.statuses, ["running", "done"]);
  assert.deepEqual(task.closed, ["session-test"]);
});
test("worker preflight enforces both provider keys and rejects stale model overrides", (t) => {
  env(t, {
    JUDGE_PROVIDER: undefined,
    JUDGE_MODEL: undefined,
    OPENAI_API_KEY: undefined,
    OPENROUTER_API_KEY: "router-test",
  });
  let config = load("lib/model-config.ts", {
    "@/lib/openai-decisions": transport,
  });
  assert.throws(config.assertSwarmModelConfig, /OPENAI_API_KEY/);
  process.env.OPENAI_API_KEY = "openai-test";
  assert.doesNotThrow(config.assertSwarmModelConfig);
  process.env.OPENROUTER_API_KEY = "";
  assert.throws(config.assertSwarmModelConfig, /browser driver needs it/);
  process.env.OPENROUTER_API_KEY = "router-test";
  process.env.JUDGE_MODEL = "openai/gpt-4o-mini";
  config = load("lib/model-config.ts", { "@/lib/openai-decisions": transport });
  assert.throws(config.assertSwarmModelConfig, /supports gpt-6-luna/);
  process.env.JUDGE_PROVIDER = "typo";
  config = load("lib/model-config.ts", { "@/lib/openai-decisions": transport });
  assert.throws(config.assertSwarmModelConfig, /JUDGE_PROVIDER must be/);
});
