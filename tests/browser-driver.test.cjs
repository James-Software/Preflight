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
  automatic = null,
  assessment = { category: "application_bug", confidence: 0.99 },
  reproduce = true,
  redirectGithub = false,
  providerBlocked = false,
}) {
  let call = 0,
    pagesCreated = 0;
  const statuses = [],
    findings = [],
    judgments = [],
    driverInputs = [],
    closed = [],
    results = [],
    blockedDatabase = [],
    assessments = [];
  let severityCalls = 0;
  function makePage() {
    const isReplay = pagesCreated++ > 0;
    let currentUrl = "about:blank";
    const events = {};
    return {
      url: () => currentUrl,
      on: (event, handler) => {
        events[event] = handler;
      },
      goto: async (url) => {
        currentUrl = url;
        if (url.endsWith("/new") && redirectGithub)
          currentUrl = "https://github.com/login";
        if (url.endsWith("/new") && providerBlocked)
          events.response?.({
            status: () => 409,
            url: () => "https://target.example/api/github/repos",
          });
        if (url.endsWith("/login")) {
          events.console?.({
            type: () => "warning",
            text: () => "old-login-warning",
          });
          events.response?.({
            status: () => 500,
            url: () => "https://target.example/old-login-request",
          });
        }
        if (url.endsWith("/terms") && (!isReplay || reproduce)) {
          events.console?.({
            type: () => "error",
            text: () => "current-terms-error",
          });
          events.response?.({
            status: () => 500,
            url: () => "https://target.example/current-terms-request",
          });
        }
      },
      waitForTimeout: async () => {},
      screenshot: async () => Buffer.from("test-image"),
      getByRole: () => ({
        first: () => ({
          fill: async () => {},
          click: async () => {},
          press: async () => {},
          getAttribute: async () => "/terms",
        }),
      }),
      locator: () => ({
        ariaSnapshot: async () =>
          `heading: ${currentUrl.endsWith("/terms") ? "Terms of Service" : "Sign in"}`,
      }),
      context: () => ({ close: async () => {} }),
    };
  }
  const task = load("src/trigger/browser-agent.ts", {
    "@/lib/db": {},
    "@/lib/check-investigation": load("lib/check-investigation.ts", {"@/lib/finding-evidence": load("lib/finding-evidence.ts", {})}),
    "@/lib/finding-evidence": load("lib/finding-evidence.ts", {}),
    "@/lib/automatic-database": {
      automaticDatabase: async () => automatic,
      automaticDatabaseUnavailable: async () => {},
      automaticDatabaseBlocked: async (...args) => blockedDatabase.push(args),
      inspectionFailure: () => "Database inspection unavailable.",
    },
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
        return makePage();
      },
    },
    "@trigger.dev/sdk": { task: (config) => config },
    "node:timers/promises": { setTimeout: async () => {} },
    "playwright-core": {
      chromium: {
        connectOverCDP: async () => ({
          newPage: async () => makePage(),
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
      assessFinding: async (evidence) => {
        assessments.push(evidence);
        return assessment;
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
      recordTestResult: async (_run, _agent, result) => results.push(result),
    },
  }).browserAgent;
  return {
    run: () =>
      task.run({
        runId: 34,
        agentIndex: 0,
        assignment: { steps },
        appUrl: "https://target.example/",
        ...(automatic ? { verifyDatabase: true } : {}),
        ...(authentication || authenticationError || setupError
          ? { authProfileId: 1 }
          : {}),
      }),
    findings,
    results,
    blockedDatabase,
    assessments,
    pagesCreated: () => pagesCreated,
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
  assert.equal((await a.run()).findings, 1, JSON.stringify(a.results));
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
test("step action limits preserve an inconclusive result without crashing the agent", async () => {
  const a = agent({
    actions: () => ({ action: "wait", value: 0, reasoning: "Still observing" }),
  });
  assert.equal((await a.run()).status, "done");
  assert.equal(a.results[0].status, "inconclusive");
  assert.equal(a.driverInputs.length, 6);
  assert.equal(a.judgments.length, 0);
  assert.equal(a.findings.length, 0);
  assert.deepEqual(a.statuses, ["running", "done"]);
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
  assert.equal((await a.run()).status, "done");
  assert.equal(a.results.at(-1).status, "not_tested");
  assert.equal(a.judgments.length, 3);
  assert.equal(a.findings.length, 0);
  assert.deepEqual(a.statuses, ["running", "done"]);
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

test("automatic verification brackets a real marked form submission and closes its connection", async () => {
  const order = [];
  const a = agent({
    steps: [
      {
        id: "automatic-database-create",
        title: "Create project",
        detail: "Create a safe test project",
      },
    ],
    automatic: {
      marker: "preflight-test",
      supported: true,
      instructions: "Use preflight-test",
      assertActive: async () => {},
      before: async () => {
        order.push("before");
        return [];
      },
      after: async (_before, button) => {
        order.push(button);
        return { passed: true, summary: "Confirmed a change to marked records." };
      },
      close: async () => {
        order.push("close");
      },
    },
    actions: [
      {
        ...done,
        action: "fill",
        role: "textbox",
        name: "Name",
        value: "preflight-test",
      },
      { ...done, action: "click", role: "button", name: "Create project" },
      done,
    ],
  });
  await a.run();
  assert.deepEqual(order, ["before", "Create project", "close"]);
  assert.match(a.driverInputs[0].goal, /Use preflight-test/);
});

test("email-only waitlist and subscription submissions get independent database checks", async () => {
  for (const button of ["Join the waitlist", "Subscribe", "Sign up", "Enter"]) {
    const order = [];
    const a = agent({
      steps: [{ id: "automatic-database-create", title: "Join waitlist" }],
      automatic: {
        marker: "preflight-test",
        email: "preflight-test@example.test",
        supported: true,
        assertActive: async () => {},
        before: async () => { order.push("before"); return []; },
        after: async (_before, label) => {
          order.push(label);
          return { passed: false, summary: "No change to uniquely marked records was observed." };
        },
        close: async () => { order.push("close"); },
      },
      actions: [
        { ...done, action: "fill", role: "textbox", name: "Email address", value: "preflight-test@example.test" },
        button === "Enter"
          ? { ...done, action: "press", role: "textbox", name: "Email address", key: "Enter" }
          : { ...done, action: "click", role: "button", name: button },
        done,
      ],
    });
    await a.run();
    assert.deepEqual(order, ["before", button, "close"]);
    assert.equal(a.blockedDatabase.length, 0);
    assert.equal(a.results[0].status, "inconclusive");
    assert.match(a.results[0].evidence, /Independent database verification: No change/);
    assert.equal(a.judgments.length, 0, "a model cannot override the missing database change");
  }
});

test("an unrelated email cannot be treated as the unique database marker", async () => {
  let inspections = 0;
  const a = agent({
    steps: [{ id: "automatic-database-create", title: "Join waitlist" }],
    automatic: {
      marker: "preflight-test", email: "preflight-test@example.test", supported: true,
      assertActive: async () => {}, close: async () => {},
      before: async () => { inspections++; return []; },
    },
    actions: [
      { ...done, action: "fill", role: "textbox", name: "Email", value: "other@example.test" },
      { ...done, action: "click", role: "button", name: "Join the waitlist" },
      done,
    ],
  });
  await a.run();
  assert.equal(inspections, 0);
  assert.equal(a.blockedDatabase.length, 1);
});

test("a speculative driver report with no executed reproduction stays in review", async () => {
  const a = agent({
    actions: [
      {
        action: "report_bug",
        title: "Session lost",
        detail: "The app must have dropped its cookies",
        reasoning: "Guess",
      },
    ],
  });
  assert.equal((await a.run()).findings, 0);
  assert.equal(a.results[0].status, "inconclusive");
  assert.equal(a.judgments.length, 0);
  assert.equal(a.severityCalls(), 0);
});
test("a driver-reported failure is verified once, never recorded again by the step judge", async () => {
  const a = agent({
    steps: [
      {
        title: "Visit terms",
        detail: "Terms should load without server errors",
      },
    ],
    actions: [
      {
        action: "goto",
        value: "https://target.example/terms",
        reasoning: "Visit terms",
      },
      {
        action: "report_bug",
        title: "Server error",
        detail: "Terms request returned 500",
        reasoning: "Observe",
      },
    ],
  });
  assert.equal((await a.run()).findings, 1);
  assert.equal(a.judgments.length, 0);
  assert.equal(a.assessments.length, 2);
  assert.equal(a.results[0].status, "confirmed");
  assert.match(a.findings[0].evidenceKey, /^[a-f0-9]{64}$/);
});
test("external GitHub sign-in and missing provider access are blocked rather than lost-session findings", async () => {
  for (const options of [{ redirectGithub: true }, { providerBlocked: true }]) {
    const a = agent({
      ...options,
      actions: [
        {
          action: "goto",
          value: "https://target.example/new",
          reasoning: "Open new project",
        },
        {
          action: "report_bug",
          title: "Lost session",
          detail: "401 means cookies lost",
          reasoning: "Guess",
        },
      ],
    });
    assert.equal((await a.run()).findings, 0);
    assert.equal(a.results[0].status, "blocked");
    assert.equal(a.judgments.length, 0);
    assert.equal(a.assessments.length, 0);
  }
});
test("a failure that disappears in the fresh context stays unconfirmed", async () => {
  const a = agent({
    reproduce: false,
    actions: [
      {
        action: "goto",
        value: "https://target.example/terms",
        reasoning: "Visit",
      },
      done,
    ],
    verdict: () => "fail",
  });
  assert.equal((await a.run()).findings, 0);
  assert.equal(a.results[0].status, "inconclusive");
  assert.match(a.results[0].summary, /not reproduced/);
});
test("low confidence and unsafe submissions cannot be promoted to confirmed bugs", async () => {
  const uncertain = agent({
    assessment: { category: "application_bug", confidence: 0.7 },
    actions: [
      {
        action: "goto",
        value: "https://target.example/terms",
        reasoning: "Visit",
      },
      done,
    ],
    verdict: () => "fail",
  });
  assert.equal((await uncertain.run()).findings, 0);
  assert.equal(uncertain.results[0].status, "inconclusive");
  assert.equal(uncertain.pagesCreated(), 1);
  const mutation = agent({
    actions: [
      {
        action: "click",
        role: "button",
        name: "Create project",
        reasoning: "Create",
      },
      {
        action: "report_bug",
        title: "Save failed",
        detail: "Did not see success",
        reasoning: "Unsure",
      },
    ],
  });
  assert.equal((await mutation.run()).findings, 0);
  assert.equal(mutation.results[0].status, "inconclusive");
  assert.equal(mutation.pagesCreated(), 1);
});
test("database workflow without a submission produces a specific blocker, never an app bug", async () => {
  const a = agent({
    steps: [{ id: "automatic-database-create", title: "Create a test record" }],
    automatic: {
      supported: true,
      marker: "preflight-test",
      assertActive: async () => {},
      close: async () => {},
      instructions: "Use preflight-test",
    },
    redirectGithub: true,
    actions: [
      {
        action: "goto",
        value: "https://target.example/new",
        reasoning: "Open",
      },
      {
        action: "report_bug",
        title: "Cannot create",
        detail: "GitHub needed",
        reasoning: "Blocked",
      },
    ],
  });
  assert.equal((await a.run()).findings, 0);
  assert.equal(a.results[0].status, "blocked");
  assert.equal(a.blockedDatabase.length, 1);
  assert.match(a.blockedDatabase[0][3], /external sign-in/);
});

test("a post-submission database inspection failure is not described as a missing create workflow", async () => {
  const a = agent({
    steps: [{ id: "automatic-database-create", title: "Create a test record" }],
    automatic: {
      supported: true,
      marker: "preflight-test",
      assertActive: async () => {},
      before: async () => [],
      after: async () => {
        throw new Error("offline");
      },
      close: async () => {},
    },
    actions: [
      {
        action: "fill",
        role: "textbox",
        name: "Project name",
        value: "preflight-test",
        reasoning: "Name the test record",
      },
      {
        action: "click",
        role: "button",
        name: "Create project",
        reasoning: "Submit",
      },
      done,
    ],
  });
  assert.equal((await a.run()).findings, 0);
  assert.equal(a.results[0].status, "blocked");
  assert.match(a.results[0].summary, /create command ran/);
  assert.equal(a.blockedDatabase.length, 0);
});
