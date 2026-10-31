// Real PostgreSQL catalogs and queries (PGlite), Chromium and the production
// worker. Only hosting, model decisions and Preflight's own result store are
// controlled boundaries. No Neon credentials or production writes are used.
// PGLITE_MODULE=/path/to/@electric-sql/pglite node tests/automatic-database.integration.cjs
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const { PGlite } = require(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const { chromium } = require("playwright-core");
const { load } = require("./load-module.cjs");

(async () => {
  const db = new PGlite();
  const config = load("lib/database-check-config.ts", {});
  const records = load("lib/database-records.ts", { "@/lib/database-check-config": config });
  const inspections = [], stored = [], proposals = [], browserResults = [];
  const client = () => ({
    query: async (query) => {
      const text = typeof query === "string" ? query : query.text;
      inspections.push(text);
      // PGlite has one session, shared with the fixture app. Session-wide
      // read-only settings must not apply to that app's connection. The real
      // BEGIN READ ONLY transactions below still execute unchanged.
      if (text === "SET default_transaction_read_only = on") return { rows: [] };
      return db.query(text, typeof query === "string" ? [] : query.values);
    },
    end: async () => {},
  });
  const automatic = load("lib/automatic-database.ts", {
    "@/lib/database-check-config": config,
    "@/lib/database-records": records,
    "@/lib/postgres-verification": { postgresClient: async () => client() },
    "@/lib/database-connections": { runDatabaseConfig: async () => ({ connectionString: "local-fixture" }) },
    "node:timers/promises": { setTimeout: () => new Promise(resolve => setTimeout(resolve, 20)) },
    "@/lib/db": { getSql: () => async (parts, ...values) => {
      const query = parts.join("?");
      if (query.includes("SELECT r.id FROM runs r")) return [{ id: 1 }];
      if (query.includes("UPDATE run_database_checks SET status=")) stored.push({ status: values[0], summary: values[1] });
      if (query.includes("INSERT INTO run_database_checks") && query.includes("'error'")) stored.push({ status: "error", summary: values[2] });
      if (query.includes("INSERT INTO run_database_cleanup")) proposals.push(JSON.parse(values[3]));
      return [];
    } },
  });
  let writes = 0;
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "POST" && req.url === "/api/waitlist") {
        let body = "";
        for await (const chunk of req) body += chunk;
        await db.query("INSERT INTO public.waitlist_entries(email) VALUES ($1)", [JSON.parse(body).email]);
        writes++;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ success: true }));
        return;
      }
      res.setHeader("Content-Type", "text/html");
      res.end(`<html><body><form>
        <label for="email">Email address</label><input id="email" type="email" required>
        <button type="submit">Join the waitlist</button></form><div role="status"></div>
        <script>document.querySelector('form').addEventListener('submit', async event => {
          event.preventDefault();
          const input = document.querySelector('input');
          ${req.url === "/working" ? "await fetch('/api/waitlist', {method:'POST',body:JSON.stringify({email:input.value})});" : ""}
          input.value = '';
          document.querySelector('[role=status]').textContent = 'You have entered the waitlist!';
        });</script></body></html>`);
    } catch (error) { res.statusCode = 500; res.end("Fixture failed"); }
  });
  let browser;
  try {
    await db.exec(`
      CREATE TABLE waitlist_entries (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        email TEXT NOT NULL UNIQUE CHECK(email=lower(trim(email))),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE subscriptions (id UUID PRIMARY KEY, email_address VARCHAR(254));
      CREATE TABLE projects (id INTEGER PRIMARY KEY, title TEXT);
      CREATE TABLE credentials_only (id INTEGER PRIMARY KEY, password TEXT, token TEXT);
      CREATE TABLE composite_key (id INTEGER, other INTEGER, email TEXT, PRIMARY KEY(id, other));
      CREATE TABLE string_key (id TEXT PRIMARY KEY, email TEXT);
    `);
    const targets = await records.recordTargets(client());
    assert.deepEqual(targets.map(t => t.table), ["projects", "subscriptions", "waitlist_entries"]);
    assert.deepEqual(targets.find(t => t.table === "waitlist_entries").columns, ["email"]);
    assert.deepEqual(await records.observeRecords(client(), targets, "unused-marker"), []);
    assert.equal(await automatic.preflightAutomaticDatabase(1), true);
    assert.equal(stored.length, 0, "empty supported tables must not create a setup error");

    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const localOrigin = `http://127.0.0.1:${server.address().port}`;
    const origin = "https://app.example";
    browser = await chromium.launch({ executablePath: require("./browser-fixture.cjs").chromiumPath, args: ["--no-sandbox"] });
    let actionIndex = 0, testEmail;
    const findingEvidence = load("lib/finding-evidence.ts", {});
    const worker = load("src/trigger/browser-agent.ts", {
      "@trigger.dev/sdk": { task: x => x },
      "@/lib/automatic-database": automatic,
      "@/lib/database-verification": {},
      "@/lib/database-check-config": config,
      "@/lib/auth-profiles": {}, "@/lib/browser-auth": {}, "@/lib/db": { getSql: () => async () => [{ id: 1 }] },
      "@/lib/finding-evidence": findingEvidence,
      "@/lib/check-investigation": load("lib/check-investigation.ts", { "@/lib/finding-evidence": findingEvidence }),
      "@/lib/public-http": {
        ...load("lib/public-http.ts", {}),
        publicHttpRequest: async (url, options) => {
          assert.equal(new URL(url).origin, origin);
          const response = await fetch(new URL(new URL(url).pathname, localOrigin), { method: options.method, headers: options.headers, body: options.body || undefined, redirect: "manual" });
          return { status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) };
        },
      },
      "@/lib/browserbase": { createBrowserSession: async () => ({ id: "fixture", connectUrl: "fixture" }), closeBrowserSession: async () => {} },
      // Production worker closes its connection after each run. Keep this
      // isolated local browser alive until all cases have finished.
      "playwright-core": { chromium: { connectOverCDP: async () => ({ newContext: (...args) => browser.newContext(...args), newPage: (...args) => browser.newPage(...args), close: async () => {} }) } },
      "node:timers/promises": { setTimeout: async () => {} },
      "@/lib/schema": {
        createAgent: async () => ({ id: 1 }), updateAgentStatus: async () => {},
        recordTestResult: async (_run, _agent, result) => browserResults.push(result),
        createFinding: async () => assert.fail("a missing save alone must not invent a confirmed bug"),
      },
      "@/lib/model-config": { MODEL_CONFIG: { judge: { provider: "openai-decisions" } } },
      "@/lib/evidence": {},
      "@/lib/models": {
        driverDecide: async input => {
          if (actionIndex++ === 0) {
            testEmail = input.goal.match(/"(preflight-[^"@]+@example\.test)"/)[1];
            return { action: "fill", role: "textbox", name: "Email address", value: testEmail, reasoning: "Use unique test email" };
          }
          if (actionIndex === 2) return { action: "click", role: "button", name: "Join the waitlist", reasoning: "Submit form" };
          assert.match(input.axTree, /You have entered the waitlist!/);
          return { action: "done", reasoning: "Success notification visible" };
        },
        judgeStep: async input => {
          assert.match(input.observation, /Independent database verification:/);
          return { verdict: input.observation.includes("No change to uniquely marked") ? "fail" : "pass" };
        },
        assessFinding: async () => ({ category: "inconclusive", confidence: 0.5 }),
      },
    }).browserAgent;
    for (const [path, expectedRows, expectedStatus] of [["/broken", 0, "inconclusive"], ["/working", 1, "passed"], ["/working", 2, "passed"]]) {
      actionIndex = 0;
      await worker.run({
        runId: 1, agentIndex: 0, appUrl: origin + path, verifyDatabase: true,
        assignment: { goal: "Verify waitlist persistence", steps: [{ id: "automatic-database-create", title: "Join waitlist", detail: "Verify the email was saved" }] },
      });
      assert.equal(stored.at(-1).status, expectedStatus);
      assert.equal((await db.query("SELECT count(*)::int AS count FROM waitlist_entries")).rows[0].count, expectedRows);
      assert.equal(writes, expectedRows);
    }
    assert.equal(browserResults[0].status, "inconclusive");
    assert.equal(proposals.length, 2);
    for (const proposal of proposals) {
      assert.equal(proposal.record.table, "waitlist_entries");
      assert.deepEqual(proposal.record.columns, ["email"]);
      const row = (await db.query("SELECT email FROM waitlist_entries WHERE id=$1", [proposal.record.value])).rows[0];
      assert.equal(row.email, `${proposal.marker}@example.test`);
    }
    assert.ok(inspections.every(q => !/^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|TRUNCATE)\b/i.test(q)));
    console.log(JSON.stringify({ emptyTableDiscovered: true, emptyBaselineAccepted: true, emailAddressAndExistingLabelsSupported: true, unsafeSchemasExcluded: true, falseSuccessHasNoSave: true, firstInsertConfirmed: true, populatedTableAlsoWorks: true, verificationIsReadOnly: true }));
  } finally {
    await browser?.close();
    if (server.listening) await new Promise(resolve => server.close(resolve));
    await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
