const assert = require("node:assert/strict"),
  http = require("node:http");
const { PGlite } = require("@electric-sql/pglite");
const { chromium } = require("playwright-core");
const { load } = require("./load-module.cjs");
(async () => {
  const state = new PGlite(),
    data = new PGlite();
  const sql = async (parts, ...v) => {
    const q = parts.reduce(
      (s, p, i) => s + p + (i < v.length ? "$" + (i + 1) : ""),
      "",
    );
    return (await state.query(q, v)).rows;
  };
  const deps = { "@/lib/db": { getSql: () => sql } },
    schema = load("lib/schema.ts", deps);
  deps["@/lib/schema"] = schema;
  const reads = [];
  const client = () => ({
    query: async (q, v) => {
      const text = typeof q === "string" ? q : q.text;
      reads.push(text);
      if (/SET default_transaction_read_only/.test(text)) return { rows: [] };
      return data.query(text, typeof q === "string" ? v : q.values);
    },
    end: async () => {},
  });
  const automatic = load("lib/automatic-database.ts", {
    ...deps,
    "@/lib/database-connections": {
      runDatabaseConfig: async () => ({
        connectionString: "fixture",
        checks: [],
      }),
    },
    "@/lib/postgres-verification": { postgresClient: async () => client() },
  });
  let writes = 0;
  const app = http.createServer(async (req, res) => {
    if (req.method === "POST") {
      let raw = "";
      for await (const c of req) raw += c;
      await data.query("INSERT INTO waitlist_entries(email) VALUES($1)", [
        JSON.parse(raw).email,
      ]);
      writes++;
      res.end("{}");
      return;
    }
    const scenario = req.url.slice(1);
    res.setHeader("content-type", "text/html");
    res.end(
      `<html><body><form><label for="email">Email address</label><input id="email" ${scenario === "unnamed" ? "" : 'name="email"'} type="email" required><button>Join the waitlist</button></form><div role="status">${scenario === "stale" ? "You have entered the waitlist!" : ""}</div><script>document.querySelector('form').onsubmit=async e=>{e.preventDefault();const input=document.querySelector('input');${scenario === "working" ? "await fetch('/save',{method:'POST',body:JSON.stringify({email:input.value})});" : ""}input.value='';document.querySelector('[role=status]').textContent=${scenario === "rejected" ? "'Invalid email address'" : "'You have entered the waitlist!'"};};</script></body></html>`,
    );
  });
  let browser;
  try {
    await schema.ensureSchema();
    await data.exec(
      "CREATE TABLE waitlist_entries(id SERIAL PRIMARY KEY,email TEXT UNIQUE NOT NULL)",
    );
    await new Promise((r) => app.listen(0, "127.0.0.1", r));
    browser = await chromium.launch({
      executablePath: require("./browser-fixture.cjs").chromiumPath,
      args: ["--no-sandbox"],
    });
    const origin = "https://demo.example",
      local = `http://127.0.0.1:${app.address().port}`;
    const project = await schema.createProject("owner", origin, "owner/app");
    const results = [];
    for (const scenario of [
      "broken",
      "working",
      "rejected",
      "stale",
      "ambiguous",
      "row-policy",
      "unnamed",
    ]) {
      if (scenario === "ambiguous")
        await data.exec(
          "CREATE TABLE newsletter_subscribers(id SERIAL PRIMARY KEY,email TEXT)",
        );
      if (scenario === "row-policy")
        await data.exec(
          "ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY",
        );
      const run = await schema.createRun(project.id, origin + "/" + scenario);
      await schema.updateRunStatus(run.id, "running");
      let decisions = 0,
        contexts = 0,
        judgeCalls = 0;
      const worker = load("src/trigger/browser-agent.ts", {
        ...deps,
        "@trigger.dev/sdk": { task: (x) => x },
        "@/lib/automatic-database": automatic,
        "@/lib/database-verification": {},
        "@/lib/auth-profiles": {},
        "@/lib/browser-auth": {},
        "@/lib/browserbase": {
          createBrowserSession: async () => ({
            id: "fixture",
            connectUrl: "fixture",
          }),
          closeBrowserSession: async () => {},
        },
        "playwright-core": {
          chromium: {
            connectOverCDP: async () => ({
              newContext: async (...a) => {
                contexts++;
                return browser.newContext(...a);
              },
              close: async () => {},
            }),
          },
        },
        "node:timers/promises": { setTimeout: async () => {} },
        "@/lib/evidence": {
          uploadScreenshot: async () =>
            `https://preflight.test/api/runs/${run.id}/screenshots/fixture`,
        },
        "@/lib/model-config": {
          MODEL_CONFIG: { judge: { provider: "openai-decisions" } },
        },
        "@/lib/models": {
          driverDecide: async (input) =>
            decisions++ === 0
              ? {
                  action: "fill",
                  role: "textbox",
                  name: "Email address",
                  value: input.goal.match(
                    /"(preflight-[^"@]+@example\.test)"/,
                  )[1],
                  reasoning: "Use supplied marker",
                }
              : {
                  action: "click",
                  role: "button",
                  name: "Join the waitlist",
                  reasoning: "Submit marked form",
                },
          judgeStep: async () => {
            judgeCalls++;
            return { verdict: "pass" };
          },
          assessSeverity: async () =>
            assert.fail(
              "Automatic runtime proof must not depend on an AI verdict",
            ),
        },
        "@/lib/public-http": {
          ...load("lib/public-http.ts", {}),
          publicHttpRequest: async (url, options) => {
            assert.equal(new URL(url).origin, origin);
            const r = await fetch(new URL(new URL(url).pathname, local), {
              method: options.method,
              headers: options.headers,
              body: options.body || undefined,
              redirect: "manual",
            });
            return {
              status: r.status,
              headers: Object.fromEntries(r.headers),
              body: Buffer.from(await r.arrayBuffer()),
            };
          },
        },
      }).browserAgent;
      await worker.run({
        runId: run.id,
        agentIndex: 0,
        appUrl: origin + "/" + scenario,
        verifyDatabase: true,
        assignment: {
          goal: "Exercise waitlist",
          steps: [
            {
              id: "form-1",
              title: "Exercise waitlist",
              detail: "Submit the provided marked email",
            },
          ],
        },
      });
      const checks =
          await sql`SELECT status,summary FROM run_database_checks WHERE run_id=${run.id}`,
        steps =
          await sql`SELECT status,evidence FROM run_test_results WHERE run_id=${run.id}`,
        findings = await sql`SELECT id FROM findings WHERE run_id=${run.id}`;
      assert.equal(decisions, 2);
      assert.equal(
        checks.length,
        1,
        "Independent replay is evidence for one logical workflow, not a duplicate check",
      );
      if (scenario === "broken") {
        assert.equal(contexts, 2);
        assert.equal(checks[0].status, "failed");
        assert.equal(steps[0].status, "confirmed");
        assert.equal(findings.length, 1);
        assert.match(
          steps[0].evidence,
          /First marker: preflight-[^\n]+\nIndependent marker: preflight-/,
        );
        assert.equal(judgeCalls, 0);
      } else if (scenario === "working") {
        assert.equal(contexts, 1);
        assert.equal(checks[0].status, "passed");
        assert.equal(steps[0].status, "passed");
        assert.equal(findings.length, 0);
      } else {
        assert.equal(contexts, 1, scenario);
        assert.equal(steps[0].status, "inconclusive", scenario);
        assert.equal(checks[0].status, "inconclusive", scenario);
        assert.equal(findings.length, 0, scenario);
      }
      results.push({
        scenario,
        contexts,
        status: steps[0].status,
        findings: findings.length,
      });
      if (scenario === "ambiguous")
        await data.exec("DROP TABLE newsletter_subscribers");
      if (scenario === "row-policy")
        await data.exec(
          "ALTER TABLE waitlist_entries DISABLE ROW LEVEL SECURITY",
        );
    }
    assert.equal(writes, 1);
    assert.ok(
      reads.every(
        (q) => !/^\s*(?:INSERT|UPDATE|DELETE|CREATE|DROP|TRUNCATE)\b/i.test(q),
      ),
    );
    console.log(
      JSON.stringify({
        realChromium: true,
        realPostgres: true,
        noAdvancedChecksConfigured: true,
        independentReplay: true,
        oneCheckPerWorkflow: true,
        readOnlyVerification: true,
        results,
      }),
    );
  } finally {
    await browser?.close();
    if (app.listening) await new Promise((r) => app.close(r));
    await state.close();
    await data.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
