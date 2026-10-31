// Optional integration: real Postgres (PGlite), Chromium, routes and worker logic.
require("node:module").registerHooks({ resolve(s, c, next) { return next(s === "next/server" ? s + ".js" : s, c); } });
const assert = require("node:assert/strict");
const http = require("node:http");
const { randomUUID } = require("node:crypto");
const { PGlite } = require(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const { chromium } = require("playwright-core");
const { load } = require("./load-module.cjs");

(async () => {
  process.env.PROFILE_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString("base64");
  const db = new PGlite();
  const sql = async (parts, ...values) => {
    let query = parts[0]; values.forEach((_, i) => query += `$${i + 1}` + parts[i + 1]);
    return (await db.query(query, values)).rows;
  };
  const deps = { "@/lib/db": { getSql: () => sql } };
  const schema = load("lib/schema.ts", deps);
  const evidence = load("lib/finding-evidence.ts", {});
  const policy = load("lib/check-investigation.ts", { "@/lib/finding-evidence": evidence });
  let writes = 0, launches = 0, models = 0;
  const server = http.createServer((req, res) => {
    if (req.method === "POST") { writes++; res.end("saved"); return; }
    if (req.url === "/api/broken") { res.statusCode = 500; res.end("failed"); return; }
    res.setHeader("Content-Type", "text/html");
    res.end(`<html><body><h1>${req.url === "/terms" ? "Terms" : req.url === "/broken" ? "Unexpected error" : "Dashboard"}</h1>
      <a href="/terms">Terms</a><button onclick="fetch('/api/create',{method:'POST'})">View details</button>
      ${req.url === "/broken" ? "<script>fetch('/api/broken')</script>" : ""}</body></html>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const localOrigin = `http://127.0.0.1:${server.address().port}`;
  const origin = "https://app.example";
  const fakeSource = "export function authorize(user) {\n  return !!user;\n}\n";
  const sha = "a".repeat(40);
  const broker = load("lib/investigation-source.ts", {
    ...deps, "@/lib/check-investigation": policy,
    "@/lib/auth-profile-state": load("lib/auth-profile-state.ts", {}),
    "@/lib/github-credentials": { loadGithubCredentials: async () => ({ login: "owner", accessToken: "never-return-this-token" }) },
    "@/lib/github": { fetchGithub: async (_ctx, url) => {
      if (url.includes("/git/trees/")) return Response.json({ tree: [{ type: "blob", mode: "100644", path: "auth.ts", size: fakeSource.length }] });
      if (url.includes("/contents/")) return Response.json({ type: "file", encoding: "base64", size: fakeSource.length, content: Buffer.from(fakeSource).toString("base64") });
      return Response.json([]);
    } },
  });
  const route = load("app/api/internal/investigation-source/route.ts", { "@/lib/investigation-source": broker });
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://www.trypreflight.dev/api/internal/investigation-source");
    return route.POST(new Request(url, init));
  };
  const drivers = new Map();
  let forcedAction = null;
  const browser = load("src/trigger/browser-agent.ts", {
    "@/lib/public-http": {
      ...load("lib/public-http.ts", {}),
      publicHttpRequest: async (url, options) => {
        const response = await fetchOriginal(new URL(new URL(url).pathname, localOrigin), { method: options.method, headers: options.headers, body: options.body || undefined, redirect: "manual" });
        return { status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) };
      },
    },
    ...deps, "@/lib/schema": schema, "@/lib/check-investigation": policy, "@/lib/finding-evidence": evidence,
    "@/lib/automatic-database": {}, "@/lib/database-verification": {}, "@/lib/database-check-config": {},
    "@/lib/auth-profiles": {}, "@/lib/browser-auth": load("lib/browser-auth.ts", {}),
    "@trigger.dev/sdk": { task: (x) => x },
    "node:timers/promises": { setTimeout: async () => {} },
    "playwright-core": { chromium: { connectOverCDP: async () => { launches++; return chromium.launch({ executablePath: require("./browser-fixture.cjs").chromiumPath, args: ["--no-sandbox"] }); } } },
    "@/lib/browserbase": { createBrowserSession: async () => ({ id: "local-only", connectUrl: "local" }), closeBrowserSession: async () => {} },
    "@/lib/evidence": { uploadScreenshot: async () => null },
    "@/lib/model-config": { MODEL_CONFIG: { judge: { provider: "openai-decisions" } } },
    "@/lib/models": {
      driverDecide: async (input) => {
        const broken = input.goal.includes("Broken route");
        const key = broken ? "broken" : "navigation";
        const n = drivers.get(key) || 0; drivers.set(key, n + 1);
        if (forcedAction) return forcedAction;
        if (n === 0) return { action: "goto", value: origin + (broken ? "/broken" : "/terms"), reasoning: "Inspect requested page" };
        return broken ? { action: "report_bug", title: "Page failed", detail: "The page shows an error and returns 500.", reasoning: "Observed" } : { action: "done", reasoning: "Terms is visible" };
      },
      judgeStep: async () => ({ verdict: "pass" }),
      assessFinding: async () => ({ category: "application_bug", confidence: 0.99 }),
      assessSeverity: async () => ({ severity: "medium" }),
      summarizeFinding: async () => "The page returned an unexpected error in two independent browser contexts. Inspect the handler and regression-test the route.",
    },
  }).browserAgent;
  let failCodeModel = false;
  const investigationTasks = load("src/trigger/investigate-checks.ts", {
    "@/lib/autonomous-regression": { verifySourceRegression: async () => null },
    ...deps, "@/lib/schema": schema, "@/lib/check-investigation": policy,
    "@/lib/investigation-source": broker, "@/lib/auth-profiles": {}, "@/lib/browser-auth": {},
    "@/lib/site": { SITE_URL: "https://www.trypreflight.dev" },
    "@/lib/models": { fixModelJson: async (_system, input) => {
      models++;
      if (failCodeModel) throw new Error("Unavailable");
      if (input.paths) return { paths: ["auth.ts"] };
      assert.ok(input.evidence.browser);
      assert.ok(Array.isArray(input.evidence.database));
      return { conclusion: "bug_hypothesis", summary: "There may be a route or authorization mismatch; runtime confirmation is required.",
        citations: [{ path: "auth.ts", start: 1, end: 3, quote: fakeSource.trimEnd() }], retestGuidance: "Inspect the requested page and its controls." };
    } },
    "@trigger.dev/sdk": { task: (x) => x, tasks: {
      batchTriggerAndWait: async (id, items) => {
        assert.equal(id, "investigate-check");
        assert.ok(items.length <= 3);
        return { runs: await Promise.all(items.map(async item => ({ ok: true, output: await investigationTasks.investigateCheck.run(item.payload) }))) };
      },
      triggerAndWait: async (id, payload) => {
      assert.equal(id, "browser-agent");
      try { return { ok: true, output: await browser.run(payload) }; } catch (error) { console.error(error); return { ok: false }; }
    } } },
  });
  const task = investigationTasks.investigateChecks;

  try {
    await schema.ensureSchema();
    const project = await schema.createProject("owner-id", origin, "owner/app");
    const plan = [
      { id: "passed", title: "Already passed", detail: "Keep result" },
      { id: "navigation", title: "Navigation", detail: "Inspect terms" },
      { id: "broken", title: "Broken route", detail: "Inspect broken page" },
      { id: "unsafe", title: "Create project", detail: "Do not repeat submission" },
      { id: "capped", title: "Extra check", detail: "All eligible checks receive investigation" },
      { id: "blocked", title: "Missing provider access", detail: "Review prerequisites without repeating authentication" },
    ];
    const run = await schema.createRun(project.id, origin, { repoFullName: "owner/app", targetSha: sha });
    await sql`UPDATE runs SET status='running',plan=${JSON.stringify(plan)}::jsonb WHERE id=${run.id}`;
    for (const step of plan) await schema.recordTestResult(run.id, 0, {
      step_id: step.id, title: step.title, status: step.id === "passed" ? "passed" : step.id === "blocked" ? "blocked" : "inconclusive", summary: "Original result", evidence: "Original browser evidence",
      retry_context: { safe: step.id !== "unsafe", startPath: "/" },
    });
    const result = await task.run({ runId: run.id });
    assert.equal(result.investigated, 5);
    assert.equal(launches, 5);
    assert.equal(writes, 0);
    const rows = await sql`SELECT step_id,status FROM run_test_results WHERE run_id=${run.id}`;
    assert.equal(rows.find((r) => r.step_id === "passed").status, "passed");
    assert.equal(rows.find((r) => r.step_id === "navigation").status, "passed");
    assert.equal(rows.find((r) => r.step_id === "broken").status, "confirmed");
    assert.equal(rows.find((r) => r.step_id === "unsafe").status, "passed");
    await schema.recordTestResult(run.id, 0, { step_id: "passed", title: "Already passed", status: "inconclusive", summary: "Late follow-up must not overwrite success" }, true, true);
    assert.equal((await sql`SELECT status FROM run_test_results WHERE run_id=${run.id} AND step_id='passed'`)[0].status, "passed");
    const findings = await sql`SELECT * FROM findings WHERE run_id=${run.id}`;
    assert.equal(findings.length, 1);
    const investigations = await sql`SELECT * FROM run_check_investigations WHERE run_id=${run.id} ORDER BY created_at`;
    assert.equal(investigations.length, 5);
    assert.ok(investigations.every((i) => i.original_evidence === "Original browser evidence" && i.source_sha === sha));
    assert.equal(investigations.find((i) => i.step_id === "unsafe").retest_status, "passed");
    assert.equal(investigations.find((i) => i.step_id === "blocked").retest_status, "passed");
    assert.equal(rows.find(r => r.step_id === "blocked").status, "passed");
    assert.equal(investigations.find((i) => i.step_id === "navigation").conclusion, "bug_hypothesis");
    assert.equal((await task.run({ runId: run.id })).investigated, 0);
    assert.equal(launches, 5);
    const report = await schema.getRunReport(project.id, run.id, "owner-id");
    assert.equal(report.testResults.find((r) => r.step_id === "navigation").investigation.retest_status, "passed");
    assert.equal(await schema.getRunReport(project.id, run.id, "other-owner"), null);
    console.log(JSON.stringify({ allEligibleChecksInvestigated: true, successfulChecksKept: true, unsafeSubmissionNotRetried: true, sourceHypothesisNotPromoted: true, reproducedFinding: true, originalEvidencePreserved: true, repeatTaskSpentNothing: true }));

    // A misleading read-only-looking control attempts a real POST. Chromium's route guard stops it.
    const run2 = await schema.createRun(project.id, origin, { repoFullName: "owner/app", targetSha: sha });
    await sql`UPDATE runs SET status='running',plan=${JSON.stringify([plan[1]])}::jsonb WHERE id=${run2.id}`;
    await schema.recordTestResult(run2.id, 0, { step_id: "navigation", title: "Navigation", status: "inconclusive", summary: "Inspect details", retry_context: { safe: true, startPath: "/" } });
    forcedAction = { action: "click", role: "button", name: "View details", reasoning: "Inspect" };
    failCodeModel = true;
    await task.run({ runId: run2.id });
    assert.equal(writes, 0);
    const guarded = await sql`SELECT status,summary FROM run_test_results WHERE run_id=${run2.id}`;
    assert.equal(guarded[0].status, "inconclusive");
    assert.match(guarded[0].summary, /read-only limits/);
    assert.equal((await sql`SELECT * FROM findings WHERE run_id=${run2.id}`).length, 0);
    console.log(JSON.stringify({ deceptiveButtonWriteBlockedInRealChromium: true, modelOutageKeptCoverage: true, noFalseFindingFromBlockedRequest: true }));

    // Duplicate task delivery cannot duplicate per-check claims.
    const run3 = await schema.createRun(project.id, origin, { repoFullName: "owner/app", targetSha: sha });
    const concurrentPlan = [0, 1, 2, 3].map((n) => ({ id: `read-${n}`, title: `Check ${n}`, detail: "Code inspection only" }));
    await sql`UPDATE runs SET status='running',plan=${JSON.stringify(concurrentPlan)}::jsonb WHERE id=${run3.id}`;
    for (const s of concurrentPlan) await schema.recordTestResult(run3.id, 0, { step_id: s.id, title: s.title, status: "inconclusive", summary: "Original", retry_context: { safe: false } });
    const beforeConcurrent = launches;
    await Promise.all([task.run({ runId: run3.id }), task.run({ runId: run3.id })]);
    assert.equal((await sql`SELECT COUNT(*)::int AS c FROM run_check_investigations WHERE run_id=${run3.id}`)[0].c, 4);
    assert.equal(launches, beforeConcurrent + 4);
    console.log(JSON.stringify({ concurrentTaskDeliveryWithoutDuplicateClaims: true, lateResultCannotOverwritePassedCheck: true }));

    // The real parent invokes the follow-up before finalizing coverage/status.
    const run4 = await schema.createRun(project.id, origin, { repoFullName: "owner/app", targetSha: sha });
    await sql`UPDATE runs SET plan=${JSON.stringify([plan[1]])}::jsonb WHERE id=${run4.id}`;
    forcedAction = null; failCodeModel = false; drivers.clear();
    let parentFollowUps = 0;
    const parent = load("src/trigger/run-swarm.ts", {
      ...deps, "@/lib/schema": schema, "@/lib/run-details": load("lib/run-details.ts", {}),
      "@/lib/run-authentication": {}, "@/lib/auth-profiles": {},
      "@/lib/model-config": { assertSwarmModelConfig: () => {} },
      "@/lib/automatic-database": { preflightAutomaticDatabase: async () => false }, "@/lib/database-verification": {},
      "@trigger.dev/sdk": { task: (x) => x, tasks: {
        batchTriggerAndWait: async () => {
          await schema.recordTestResult(run4.id, 0, { step_id: "navigation", title: "Navigation", status: "inconclusive", summary: "Action limit", retry_context: { safe: true, startPath: "/" } });
          return { runs: [{ ok: true }] };
        },
        triggerAndWait: async (id, payload) => { assert.equal(id, "investigate-checks"); parentFollowUps++; return { ok: true, output: await task.run(payload) }; },
      } },
    }).runSwarm;
    assert.equal((await parent.run({ runId: run4.id })).status, "done");
    assert.equal(parentFollowUps, 1);
    assert.equal((await sql`SELECT status FROM runs WHERE id=${run4.id}`)[0].status, "done");
    assert.equal((await sql`SELECT status FROM run_test_results WHERE run_id=${run4.id}`)[0].status, "passed");
    console.log(JSON.stringify({ parentAutomaticallyInvestigates: true, recoveredCoverageFinalizesAsCompleted: true }));

    // An old partial report with completed failed investigations recovers in place.
    const legacy = await schema.createRun(project.id, origin, { repoFullName: "owner/app", targetSha: sha });
    await sql`UPDATE runs SET status='partial',plan=${JSON.stringify([plan[1]])}::jsonb WHERE id=${legacy.id}`;
    await schema.recordTestResult(legacy.id, 0, { step_id: "navigation", title: "Navigation", status: "inconclusive", summary: "Action limit", evidence: "Original legacy observations", retry_context: { safe: false, startPath: "/" } });
    await sql`INSERT INTO run_check_investigations(run_id,agent_index,step_id,worker_token,original_summary,original_evidence,budget_slot,state)
      VALUES(${legacy.id},0,'navigation',${randomUUID()}::uuid,'Old source failure','Original legacy observations',0,'completed')`;
    drivers.clear();
    const recovery = load("src/trigger/recover-run-verification.ts", {
      ...deps, "@/lib/schema": schema,
      "@/lib/run-authentication": { renewRunAuthentication: async () => false },
      "@trigger.dev/sdk": { task: x => x, schedules: { task: x => x }, tasks: { triggerAndWait: async (_id, payload) => ({ ok: true, output: await task.run(payload) }) } },
    }).recoverRunVerification;
    assert.equal((await recovery.run({ runId: legacy.id, projectId: project.id })).recovered, true);
    assert.equal((await sql`SELECT status FROM runs WHERE id=${legacy.id}`)[0].status, "done");
    assert.equal((await sql`SELECT status FROM run_test_results WHERE run_id=${legacy.id}`)[0].status, "passed");
    assert.equal((await sql`SELECT original_evidence FROM run_check_investigations WHERE run_id=${legacy.id}`)[0].original_evidence, "Original legacy observations");
    assert.equal((await recovery.run({ runId: legacy.id, projectId: project.id })).recovered, false);
    console.log(JSON.stringify({ oldPartialReportRecovered: true, originalWriteNotReplayed: true, repeatRecoverySpentNothing: true }));

    // Signed requests still need the live owner/run/step grant, not just a shared secret.
    const grant = investigations[0];
    const input = { runId: run.id, agentIndex: 0, stepId: grant.step_id, token: grant.worker_token, timestamp: Date.now() };
    const request = async (data, signature) => { const body = JSON.stringify(data); return route.POST(new Request("https://www.trypreflight.dev/api/internal/investigation-source", { method: "POST", body, headers: { "x-preflight-investigation": signature || broker.signInvestigationRequest(body) } })); };
    assert.equal((await request(input, "invalid")).status, 403);
    assert.equal((await request(input)).status, 409); // completed grant cannot read source
    await sql`UPDATE run_check_investigations SET state='investigating' WHERE run_id=${run.id} AND step_id=${grant.step_id}`;
    assert.equal((await request({ ...input, token: randomUUID() })).status, 409);
    const authorized = await request(input);
    assert.equal(authorized.status, 200);
    assert.ok(!(await authorized.text()).includes("never-return-this-token"));
    await sql`UPDATE run_check_investigations SET lease_until=NOW()-INTERVAL '1 minute' WHERE run_id=${run.id} AND step_id=${grant.step_id}`;
    assert.equal((await request(input)).status, 409);
    await sql`UPDATE run_check_investigations SET lease_until=NOW()+INTERVAL '1 minute' WHERE run_id=${run.id} AND step_id=${grant.step_id}`;
    await sql`UPDATE runs SET status='cancelled' WHERE id=${run.id}`;
    assert.equal((await request(input)).status, 409);
    assert.equal((await task.run({ runId: run.id })).investigated, 0);
    await sql`UPDATE runs SET status='running' WHERE id=${run.id}`;
    await sql`UPDATE projects SET repo_full_name='owner/other' WHERE id=${project.id}`;
    assert.equal((await request(input)).status, 409);
    console.log(JSON.stringify({ unsignedDenied: true, wrongNonceDenied: true, completedGrantDenied: true, cancellationDenied: true, relinkedRepoDenied: true, credentialsNeverReturned: true }));
    const cleanup = load("lib/database-cleanup.ts", { ...deps, "@/lib/database-connections": {}, "@/lib/database-check-config": { DatabaseCheckError: Error }, "@/lib/postgres-verification": {}, "@/lib/database-records": {} });
    await sql`UPDATE runs SET status='partial' WHERE id=${run.id}`;
    assert.equal((await cleanup.cleanupContext(project.id, run.id, "owner-id")).finished, true);
    console.log(JSON.stringify({ partialRunCleanupCanBeReviewed: true }));
  } finally {
    globalThis.fetch = fetchOriginal;
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
