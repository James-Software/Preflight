const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load-module.cjs");

const input = {
  goal: "Visit /terms",
  history: [],
  axTree: "heading Terms of Service",
  consoleLogs: [],
  screenshotBase64: "test-image",
};
const done = {
  action: "done",
  reasoning: "Terms page loaded",
  role: null,
  name: null,
  value: null,
  direction: null,
  key: null,
  title: null,
  detail: null,
};
function driver(t, outputs) {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "router-test";
  t.after(() => {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  });
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(
      new Headers(options.headers).get("authorization"),
      "Bearer router-test",
    );
    calls.push(JSON.parse(options.body));
    return Response.json({
      choices: [{ message: { content: outputs.shift() } }],
    });
  });
  const api = load("lib/models.ts", {
    "@/lib/model-config": {
      MODEL_CONFIG: { driver: { model: "driver-test" } },
    },
    "@/lib/openai-decisions": {},
  });
  return { decide: () => api.driverDecide(input), calls };
}
test("driver requests one strict structured action and repairs a malformed response once", async (t) => {
  const malformed = JSON.stringify(done) + "\nUnexpected prose after JSON";
  const d = driver(t, [malformed, JSON.stringify(done)]);
  assert.equal((await d.decide()).action, "done");
  assert.equal(d.calls.length, 2);
  const request = d.calls[0];
  assert.equal(request.model, "driver-test");
  assert.equal(request.response_format.type, "json_schema");
  const schema = request.response_format.json_schema;
  assert.equal(schema.strict, true);
  assert.equal(schema.schema.additionalProperties, false);
  assert.deepEqual(
    schema.schema.required.sort(),
    Object.keys(schema.schema.properties).sort(),
  );
  assert.deepEqual(request.provider, { require_parameters: true });
  assert.equal(d.calls[1].messages.at(-2).role, "assistant");
  assert.equal(d.calls[1].messages.at(-2).content, malformed);
  assert.match(d.calls[1].messages.at(-1).content, /one corrected action/);
});
test("concatenated actions never execute and repeated invalid JSON becomes a safe runner error", async (t) => {
  const privateMarker = "private-test-page-content";
  const invalid =
    JSON.stringify({ ...done, reasoning: privateMarker }) +
    JSON.stringify(done);
  const d = driver(t, [invalid, invalid]);
  await assert.rejects(
    d.decide(),
    (error) =>
      /after 2 attempts/.test(error.message) &&
      /not a confirmed application bug/.test(error.message) &&
      !error.message.includes(privateMarker),
  );
  assert.equal(d.calls.length, 2);
});
test("a valid object with unusable action fields is repaired rather than executed", async (t) => {
  const d = driver(t, [
    JSON.stringify({ ...done, action: "goto", value: null }),
    JSON.stringify({
      ...done,
      action: "goto",
      value: "https://target.example/terms",
    }),
  ]);
  assert.equal((await d.decide()).value, "https://target.example/terms");
  assert.equal(d.calls.length, 2);
});

function agent({
  steps = [{ title: "Visit /terms", detail: "Open /terms" }],
  actions,
  verdict = () => "pass",
  authentication = null,
  authenticationError = null,
  setupError = null,
}) {
  let currentUrl = "about:blank",
    call = 0;
  const events = {},
    statuses = [],
    findings = [],
    judgments = [],
    driverInputs = [],
    closed = [];
  let severityCalls = 0;
  const page = {
    url: () => currentUrl,
    on: (event, handler) => {
      events[event] = handler;
    },
    goto: async (url) => {
      currentUrl = url;
      if (url.endsWith("/login")) {
        events.console({
          type: () => "warning",
          text: () => "old-login-warning",
        });
        events.response({
          status: () => 500,
          url: () => "https://target.example/old-login-request",
        });
      }
      if (url.endsWith("/terms")) {
        events.console({
          type: () => "error",
          text: () => "current-terms-error",
        });
        events.response({
          status: () => 500,
          url: () => "https://target.example/current-terms-request",
        });
      }
    },
    waitForTimeout: async () => {},
    screenshot: async () => Buffer.from("test-image"),
    locator: () => ({
      ariaSnapshot: async () =>
        `heading: ${currentUrl.endsWith("/terms") ? "Terms of Service" : "Sign in"}`,
    }),
  };
  const task = load("src/trigger/browser-agent.ts", {
    "@/lib/database-verification": {},
    "@/lib/database-check-config": {},
    "@/lib/auth-profiles": {
      getRunAuthentication: async () => {
        if (authenticationError) throw authenticationError;
        return authentication;
      },
    },
    "@/lib/browser-auth": {
      profileRedactor: () => (text) => text,
      authenticatedPage: async () => {
        if (setupError) throw setupError;
        return page;
      },
    },
    "@trigger.dev/sdk": { task: (config) => config },
    "node:timers/promises": { setTimeout: async () => {} },
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
        id: "test-session",
        connectUrl: "test",
      }),
      closeBrowserSession: async (id) => closed.push(id),
    },
    "@/lib/models": {
      driverDecide: async (input) => {
        driverInputs.push(input);
        const action =
          typeof actions === "function" ? actions(call++) : actions[call++];
        if (action instanceof Error) throw action;
        return action;
      },
      judgeStep: async (input) => {
        judgments.push(input);
        return { verdict: verdict(input) };
      },
      assessSeverity: async () => {
        severityCalls++;
        return { severity: "medium", confidence: 0.8 };
      },
    },
    "@/lib/model-config": {
      MODEL_CONFIG: { judge: { provider: "openai-decisions" } },
    },
    "@/lib/evidence": {
      uploadScreenshot: async () => "https://example.com/finding.jpg",
    },
    "@/lib/schema": {
      createAgent: async () => ({ id: 56 }),
      updateAgentStatus: async (_id, status) => statuses.push(status),
      createFinding: async (finding) => findings.push(finding),
    },
  }).browserAgent;
  return {
    run: () =>
      task.run({
        runId: 34,
        agentIndex: 0,
        assignment: { steps },
        appUrl: "https://target.example/",
        ...(authentication || authenticationError || setupError
          ? { authProfileId: 1 }
          : {}),
      }),
    findings,
    judgments,
    driverInputs,
    statuses,
    closed,
    severityCalls: () => severityCalls,
  };
}
test("the reported login→terms JSON failure fails the agent without inventing a terms finding", async () => {
  const error = new SyntaxError(
    "Unexpected non-whitespace character after JSON at position 209",
  );
  const a = agent({
    steps: [{ title: "Visit /login" }, { title: "Visit /terms" }],
    actions: [
      {
        action: "goto",
        value: "https://target.example/login",
        reasoning: "login-only-action",
      },
      done,
      {
        action: "goto",
        value: "https://target.example/terms",
        reasoning: "Open terms",
      },
      error,
    ],
  });
  await assert.rejects(
    a.run(),
    (e) =>
      /Visit \/terms/.test(e.message) &&
      /not evaluated/.test(e.message) &&
      e.cause === error,
  );
  assert.equal(a.judgments.length, 1);
  assert.equal(a.judgments[0].stepTitle, "Visit /login");
  assert.equal(a.findings.length, 0);
  assert.equal(a.severityCalls(), 0);
  assert.deepEqual(a.statuses, ["running", "failed"]);
  assert.deepEqual(a.closed, ["test-session"]);
});
test("later steps use only their own actions, console output and network evidence", async () => {
  const a = agent({
    steps: [{ title: "Visit /login" }, { title: "Visit /terms" }],
    actions: [
      {
        action: "goto",
        value: "https://target.example/login",
        reasoning: "login-only-action",
      },
      done,
      {
        action: "goto",
        value: "https://target.example/terms",
        reasoning: "terms-only-action",
      },
      done,
    ],
    verdict: (input) => (input.stepTitle === "Visit /terms" ? "fail" : "pass"),
  });
  assert.equal((await a.run()).findings, 1);
  const observation = a.judgments[1].observation;
  assert.match(observation, /Current URL: https:\/\/target.example\/terms/);
  assert.match(observation, /Terms of Service/);
  assert.match(observation, /terms-only-action/);
  assert.match(observation, /current-terms-error/);
  assert.doesNotMatch(
    observation,
    /login-only-action|old-login-warning|old-login-request/,
  );
  assert.doesNotMatch(
    a.driverInputs[2].history.join("\n"),
    /login-only-action/,
  );
  assert.deepEqual(a.driverInputs[2].consoleLogs, []);
  assert.doesNotMatch(a.findings[0].reproSteps, /login-only-action/);
  assert.match(a.findings[0].reproSteps, /terms-only-action/);
  assert.match(a.findings[0].consoleLogs, /current-terms-error/);
  assert.doesNotMatch(a.findings[0].consoleLogs, /old-login-warning/);
  assert.deepEqual(
    a.findings[0].networkErrors.map((e) => e.url),
    ["https://target.example/current-terms-request"],
  );
});
test("running out of step actions cannot become a website bug or a completed agent", async () => {
  const a = agent({
    actions: () => ({ action: "wait", value: 0, reasoning: "Still observing" }),
  });
  await assert.rejects(a.run(), /action budget/);
  assert.equal(a.driverInputs.length, 6);
  assert.equal(a.judgments.length, 0);
  assert.equal(a.findings.length, 0);
  assert.deepEqual(a.statuses, ["running", "failed"]);
});
test("running out of overall actions cannot silently skip the remaining planned steps", async () => {
  const a = agent({
    steps: [
      { title: "One" },
      { title: "Two" },
      { title: "Three" },
      { title: "Four" },
    ],
    actions: (i) =>
      [5, 11, 13].includes(i)
        ? done
        : { action: "wait", value: 0, reasoning: "Observe" },
  });
  await assert.rejects(a.run(), /before all steps were tested/);
  assert.equal(a.judgments.length, 3);
  assert.equal(a.findings.length, 0);
  assert.deepEqual(a.statuses, ["running", "failed"]);
});

test("authentication setup failures never become app findings or model judgments", async () => {
  const expired = agent({
    authentication: {
      origin: "https://target.example",
      verification_path: "/dashboard",
    },
    setupError: new Error("Authentication check failed"),
  });
  await assert.rejects(expired.run(), /Authentication check failed/);
  assert.equal(expired.findings.length, 0);
  assert.equal(expired.judgments.length, 0);
  assert.equal(expired.driverInputs.length, 0);
  assert.deepEqual(expired.closed, ["test-session"]);
  const unavailable = agent({
    authenticationError: new Error("Profile was revoked"),
  });
  await assert.rejects(unavailable.run(), /revoked/);
  assert.deepEqual(unavailable.closed, []);
  assert.equal(unavailable.findings.length, 0);
});
