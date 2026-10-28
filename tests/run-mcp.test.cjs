require("node:module").registerHooks({ resolve(s, c, next) { return next(s === "next/server" ? s + ".js" : s, c); } });
const { test } = require("node:test"), assert = require("node:assert/strict");
const { NextRequest } = require("next/server");
const { load } = require("./load-module.cjs");
class AgentAccessError extends Error {}
const site = "https://www.trypreflight.dev";
function fixture() {
  const calls = [];
  const route = load("app/api/mcp/route.ts", {
    "@/lib/site": { SITE_URL: site },
    "@/lib/run-agent-access": { AgentAccessError, authenticateRunAgent: async (header) => { if (header === "Bearer fixture-offline") throw new Error("private-database-uri"); if (header !== "Bearer fixture-token") throw new AgentAccessError("Denied"); return { run_id: 42 }; } },
    "@/lib/run-agent-tools": { runAgentTools: () => [{ name: "get_run", inputSchema: { type: "object", properties: {} } }],
      callRunAgentTool: async (...args) => { calls.push(args); if (args[1] === "failure") throw new Error("postgres://private-password"); return { runId: 42 }; } },
  });
  const request = (body, headers = {}) => route.POST(new NextRequest(site + "/api/mcp", {
    method: "POST", headers: { Authorization: "Bearer fixture-token", Accept: "application/json, text/event-stream", "Content-Type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body),
  }));
  return { route, request, calls };
}
test("MCP requires explicit bearer authorization, rejects foreign browser origins, and ignores cookies", async () => {
  const f = fixture(), message = { jsonrpc: "2.0", id: 1, method: "tools/list" };
  assert.equal((await f.request(message, { Authorization: "", Cookie: "authjs.session-token=private-cookie" })).status, 401);
  assert.equal((await f.request(message, { Origin: "https://evil.test" })).status, 403);
  assert.equal((await f.request(message, { Origin: site })).status, 200);
  assert.equal((await f.request(message, { "Content-Type": "text/plain" })).status, 415);
  assert.equal((await f.request(message, { Accept: "text/html" })).status, 406);
  assert.equal((await f.request(message, { "MCP-Protocol-Version": "unsupported" })).status, 400);
  const outage = await f.request(message, {Authorization:"Bearer fixture-offline"});
  assert.equal(outage.status,503); assert.ok(!(await outage.text()).includes("private-database-uri"));
  assert.equal(f.calls.length, 0);
});
test("MCP negotiates initialization and supports stateless JSON transport and initialized notification", async () => {
  const f = fixture();
  const response = await f.request({ jsonrpc: "2.0", id: "init", method: "initialize", params: { protocolVersion: "2025-11-25", clientInfo: { name: "codex", version: "1" }, capabilities: {} } });
  const data = await response.json();
  assert.equal(data.result.protocolVersion, "2025-11-25"); assert.equal(data.id, "init");
  assert.match(data.result.instructions, /untrusted/); assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal((await f.request({ jsonrpc: "2.0", method: "notifications/initialized" })).status, 202);
  assert.equal((await f.request({ jsonrpc: "2.0", method: "notifications/roots/list_changed" })).status, 202);
  assert.equal((await f.route.GET()).status, 405); assert.equal((await f.route.DELETE()).status, 405);
});
test("malformed and unknown MCP requests never execute a tool, and provider errors stay private", async () => {
  const f = fixture();
  for (const body of ["{", [], { jsonrpc: "2.0", id: null, method: "tools/list" }]) assert.equal((await f.request(body)).status, 400);
  const unknown = await (await f.request({ jsonrpc: "2.0", id: 1, method: "does-not-exist" })).json();
  assert.equal(unknown.error.code, -32601); assert.equal(f.calls.length, 0);
  const failure = await (await f.request({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "failure", arguments: {} } })).json();
  assert.equal(failure.result.isError, true); assert.ok(!JSON.stringify(failure).includes("private-password"));
});
test("agent prompts describe real MCP access, fallback transport and bounded review authority", () => {
  const api = load("lib/run-agent-access.ts", { "@/lib/db": {}, "@/lib/schema": {}, "@/lib/site": { SITE_URL: site } });
  const token = "pf_run_" + "A".repeat(43);
  const prompt = api.runAgentPrompt({ projectId: 7, runId: 42, token, expiresAt: "2026-10-29T00:00:00Z", repo: "owner/private" });
  assert.match(prompt, /run #42/); assert.match(prompt, /\/api\/mcp/);
  assert.match(prompt, /notifications\/initialized/); assert.match(prompt, /nextOffset/);
  assert.match(prompt, /Accept\/Deny/); assert.match(prompt, /Keep it in memory/);
  assert.equal(prompt.split(token).length, 2);
  assert.ok(!prompt.split("\n").filter((l) => l.startsWith("Endpoint:")).join("").includes(token));
});
test("Copy agent prompt uses the shared transitioning copy/check icons and labelled keyboard controls", () => {
  const React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
  const Component = load("components/CopyAgentPrompt.tsx", { "next/navigation": {useRouter:()=>({refresh:()=>{}})}, "@/components/IconSwap": load("components/IconSwap.tsx", {}) }).default;
  const html = renderToStaticMarkup(React.createElement(Component, { projectId: 1, runId: 42 }));
  assert.match(html, /Copy agent prompt/); assert.match(html, /icon-swap__icon/);
  assert.match(html, /data-visible="true"/); assert.match(html, /data-visible="false"/);
  assert.match(html, /pressable/); assert.match(html, /type="button"/);
  assert.doesNotMatch(html, /pf_run_/);
});
test("saved agent assessments do not render a mandatory review queue or a deletion button", () => {
  const React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
  const Component = load("components/RunAgentReviews.tsx", {}).default;
  const html = renderToStaticMarkup(React.createElement(Component, { reviews: [{ id: "1", target_title: "Create project", outcome: "safe_to_cleanup", summary: "The marked record matched at inspection.", basis: "database_inspection", citations: [], actor_login: "owner" }] }));
  assert.match(html, /Eligible at inspection/); assert.match(html, /Original test results and cleanup decisions stay separate/);
  assert.doesNotMatch(html, /<button|Approve|Execute/);
});
