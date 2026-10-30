// Real Chromium, worker and PostgreSQL cancellation state. Only the model and
// public HTTP transport's destination are adapted to disposable local fixtures.
const assert = require("node:assert/strict");
const http = require("node:http");
const zlib = require("node:zlib");
const { chromium } = require("playwright-core");
const { PGlite } = require(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const { load } = require("./load-module.cjs");

(async () => {
  const db = new PGlite();
  const sql = async (parts, ...values) => { let q = parts[0]; values.forEach((_, i) => { q += `$${i + 1}` + parts[i + 1]; }); return (await db.query(q, values)).rows; };
  const deps = { "@/lib/db": { getSql: () => sql } };
  const schema = load("lib/schema.ts", deps);
  let writes = 0, externalRequests = 0, redirectCookieObserved = false;
  const app = http.createServer((req, res) => {
    if (req.method === "POST") { writes++; res.end("written"); return; }
    if (req.url === "/redirect") { res.writeHead(302, { location: "https://outside.example/collect" }); res.end(); return; }
    if (req.url === "/internal-redirect") { res.writeHead(302, { location: "/final", "set-cookie": "redirect_fixture=present; Path=/; Secure; HttpOnly" }); res.end(); return; }
    if (req.url === "/final") redirectCookieObserved = /redirect_fixture=present/.test(req.headers.cookie || "");
    if (req.url === "/meta") { res.end('<html><meta http-equiv="refresh" content="0; url=https://outside.example/collect"></html>'); return; }
    const html = '<html><body><h1>Fixture</h1><button onclick="fetch(\'/api/delete\',{method:\'POST\'})">Delete project</button><button onclick="fetch(\'/api/mutate\',{method:\'POST\'})">View details</button></body></html>';
    res.setHeader("Content-Type", "text/html");
    res.setHeader("Content-Encoding", "gzip");
    res.end(zlib.gzipSync(html));
  });
  let browser;
  try {
    await schema.ensureSchema();
    await new Promise(resolve => app.listen(0, "127.0.0.1", resolve));
    const origin = "https://app.example";
    const project = await schema.createProject("fixture-owner", origin, "fixture/app");
    browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
    const boundary = {
      ...load("lib/public-http.ts", {}),
      publicHttpRequest: async (raw, options) => {
        if (new URL(raw).origin !== origin) { externalRequests++; throw new Error("Outside fixture origin"); }
        return new Promise((resolve, reject) => {
          const request = http.request({ hostname: "127.0.0.1", port: app.address().port, path: new URL(raw).pathname,
            method: options.method, headers: options.headers, signal: options.signal }, response => {
            const chunks = []; response.on("data", b => chunks.push(b)); response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
          }); request.on("error", reject); request.end(options.body || undefined);
        });
      },
    };
    const evidence = load("lib/finding-evidence.ts", {});
    const outcomes = [];
    for (const scenario of ["cancel-before-action", "delete", "external-navigation", "external-redirect", "meta-redirect", "unmarked-write", "internal-redirect"]) {
      const run = await schema.createRun(project.id, origin);
      await schema.updateRunStatus(run.id, "running");
      let decisions = 0;
      const worker = load("src/trigger/browser-agent.ts", {
        ...deps, "@/lib/schema": schema, "@/lib/public-http": boundary,
        "@/lib/finding-evidence": evidence,
        "@/lib/check-investigation": load("lib/check-investigation.ts", { "@/lib/finding-evidence": evidence }),
        "@/lib/automatic-database": {}, "@/lib/database-verification": {},
        "@/lib/database-check-config": load("lib/database-check-config.ts", {}),
        "@/lib/auth-profiles": {}, "@/lib/browser-auth": {},
        "@trigger.dev/sdk": { task: x => x },
        "node:timers/promises": { setTimeout: () => new Promise(resolve => setTimeout(resolve, 20)) },
        "playwright-core": { chromium: { connectOverCDP: async () => ({ newContext: (...args) => browser.newContext(...args), close: async () => {} }) } },
        "@/lib/browserbase": { createBrowserSession: async () => ({ id: "fixture", connectUrl: "fixture" }), closeBrowserSession: async () => {} },
        "@/lib/models": {
          driverDecide: async input => {
            if (decisions === 0 || scenario === "internal-redirect") assert.match(input.axTree, /Fixture/); // Compressed responses still render.
            if (decisions++ === 0) {
              if (scenario === "cancel-before-action") assert.equal(await schema.cancelRun(run.id, project.id), true);
              if (scenario === "external-navigation") return { action: "goto", value: "https://outside.example/collect", reasoning: "Adversarial fixture" };
              if (scenario === "external-redirect") return { action: "goto", value: origin + "/redirect", reasoning: "Inspect local redirect" };
              if (scenario === "meta-redirect") return { action: "goto", value: origin + "/meta", reasoning: "Inspect meta redirect" };
              if (scenario === "internal-redirect") return { action: "goto", value: origin + "/internal-redirect", reasoning: "Inspect safe redirect" };
              return { action: "click", role: "button", name: scenario === "unmarked-write" ? "View details" : "Delete project", reasoning: "Adversarial fixture" };
            }
            return { action: "done", reasoning: "Stop" };
          },
          judgeStep: async () => scenario === "internal-redirect" ? { verdict: "pass" } : assert.fail("blocked activity must not become an application verdict"),
        },
        "@/lib/model-config": { MODEL_CONFIG: { judge: { provider: "openai-decisions" } } }, "@/lib/evidence": {},
      }).browserAgent;
      const result = await worker.run({ runId: run.id, agentIndex: 0, appUrl: origin, assignment: { steps: [{ id: "inspect", title: "Inspect fixture", detail: "Inspect visible content" }] } });
      const report = await schema.getRunReport(project.id, run.id, "fixture-owner");
      if (scenario === "cancel-before-action") {
        assert.equal(result.status, "cancelled");
        assert.equal(report.run.status, "cancelled");
      } else assert.equal(report.testResults[0].status, scenario === "internal-redirect" ? "passed" : "blocked", scenario);
      outcomes.push({ scenario, status: scenario === "cancel-before-action" ? result.status : report.testResults[0].status });
      assert.equal(writes, 0, scenario);
      assert.equal(externalRequests, 0, scenario);
    }
    assert.equal(redirectCookieObserved, true);
    console.log(JSON.stringify({ realChromium: true, realRunState: true, compressedPagesRender: true, sameOriginRedirectAndCookieWork: true, writes, externalRequests, outcomes }));
  } finally {
    await browser?.close();
    if (app.listening) await new Promise(resolve => app.close(resolve));
    await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
