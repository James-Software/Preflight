// Real Streamable HTTP SDK + Next handlers + two PostgreSQL databases (PGlite).
require("node:module").registerHooks({ resolve(s, c, next) { return next(s === "next/server" ? s + ".js" : s, c); } });
const assert = require("node:assert/strict"), http = require("node:http"), { randomUUID } = require("node:crypto");
const { PGlite } = require(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const sdk = process.env.MCP_SDK_ROOT || "@modelcontextprotocol/sdk";
const { Client } = require(sdk + "/client/index.js");
const { StreamableHTTPClientTransport } = require(sdk + "/client/streamableHttp.js");
const { NextRequest } = require("next/server");
const { load } = require("./load-module.cjs");
(async () => {
  process.env.PROFILE_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  const app = new PGlite(), target = new PGlite();
  const sql = async (parts, ...values) => { let text = parts[0]; values.forEach((_, i) => text += `$${i + 1}` + parts[i + 1]); return (await app.query(text, values)).rows; };
  const deps = { "@/lib/db": { getSql: () => sql } }, schema = load("lib/schema.ts", deps);
  let route;
  const server = http.createServer(async (req, res) => {
    try {
      let body = ""; for await (const chunk of req) body += chunk;
      const request = new NextRequest(origin + req.url, { method: req.method, headers: req.headers, ...(["GET", "HEAD"].includes(req.method) ? {} : { body }) });
      const response = await route[req.method](request);
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text());
    } catch { res.writeHead(500); res.end("Fixture transport failed"); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`, site = { SITE_URL: origin };
  const state = load("lib/auth-profile-state.ts", {}), config = load("lib/database-check-config.ts", {});
  const records = load("lib/database-records.ts", { "@/lib/database-check-config": config });
  const queries = [];
  const postgres = load("lib/postgres-verification.ts", {
    "@/lib/database-check-config": config,
    "node:dns/promises": { lookup: async () => [{address:"93.184.216.34",family:4}] },
    pg: { Client: class {
      on(){} async connect(){} async end(){}
      async query(query) { queries.push(query); return typeof query === "string" ? target.query(query) : target.query(query.text, query.values); }
    } },
  });
  const connections = load("lib/database-connections.ts", { ...deps, "@/lib/schema": schema, "@/lib/auth-profile-state": state, "@/lib/database-check-config": config, "@/lib/postgres-verification": postgres });
  const access = load("lib/run-agent-access.ts", { ...deps, "@/lib/schema": schema, "@/lib/site": site });
  const sourceText = "export function loadPage() {\n  return 'expected page';\n}\n";
  const source = load("lib/run-agent-source.ts", { ...deps, "@/lib/schema": schema, "@/lib/run-agent-access": access,
    "@/lib/check-investigation": load("lib/check-investigation.ts", { "@/lib/finding-evidence": load("lib/finding-evidence.ts", {}) }),
    "@/lib/github-credentials": { loadGithubCredentials: async () => ({ login: "owner", accessToken: "private-github-token" }) },
    "@/lib/github": { fetchGithub: async (_ctx, url) => {
      assert.ok(url.startsWith("https://api.github.com/repos/owner/app/"));
      if (url.includes("/git/trees/")) return Response.json({ tree: [
        { type: "blob", path: "app.ts", mode: "100644", size: sourceText.length },
        { type: "blob", path: ".env", mode: "100644", size: 20 },
      ] });
      assert.ok(url.includes(`?ref=${"a".repeat(40)}`));
      return Response.json({ type: "file", encoding: "base64", size: sourceText.length, content: Buffer.from(sourceText).toString("base64") });
    } },
  });
  const tools = load("lib/run-agent-tools.ts", { ...deps, "@/lib/schema": schema, "@/lib/run-agent-access": access, "@/lib/run-agent-source": source,
    "@/lib/database-connections": connections, "@/lib/postgres-verification": postgres, "@/lib/database-records": records, "@/lib/database-check-config": config });
  route = load("app/api/mcp/route.ts", { "@/lib/run-agent-access": access, "@/lib/run-agent-tools": tools, "@/lib/site": site });
  let actor = "owner-id";
  const user = { auth: async () => ({ user: { githubId: actor, githubLogin: actor === "owner-id" ? "owner" : "member" } }) };
  const grantRoute = load("app/api/projects/[id]/runs/[runId]/agent-access/route.ts", { "@/auth": user, "@/lib/run-agent-access": access });
  const clients = [];
  const nativeClient = async (token) => { const client = new Client({ name: "codex-integration", version: "1" }); await client.connect(new StreamableHTTPClientTransport(new URL(origin + "/api/mcp"), { requestInit: { headers: { Authorization: `Bearer ${token}` } } })); clients.push(client); return client; };
  const call = async (client, name, args = {}) => { const result = await client.callTool({ name, arguments: args }); assert.notEqual(result.isError, true, result.content?.[0]?.text); return result.structuredContent || JSON.parse(result.content[0].text); };
  try {
    await schema.ensureSchema();
    await target.exec("CREATE TABLE widgets(id INT PRIMARY KEY,name TEXT,note TEXT)");
    const configuredId = randomUUID();
    const checks = [{id:configuredId,title:"Marked widget exists",instructions:"Create a widget named {{marker}}, then Save.",buttonLabel:"Save",query:"SELECT count(*)::int AS value FROM widgets WHERE name=$1",operator:"equals",expected:1}];
    const project = await schema.createProject(actor, "https://app.example.test", "owner/app");
    await connections.saveProjectDatabase(project.id, actor, { origin: "https://app.example.test", connectionString: "postgres://reader:private-db-secret@db.example.test/app?sslmode=require", checks });
    const database = await connections.databaseForRun(project.id, actor, "https://app.example.test");
    const run = await schema.createRun(project.id, "https://app.example.test", { repoFullName: "owner/app", targetSha: "a".repeat(40), database });
    await sql`UPDATE runs SET status='partial',auth_profile_snapshot=${JSON.stringify({ encrypted_state: "DO_NOT_EXPORT_SESSION" })}::jsonb WHERE id=${run.id}`;
    await schema.recordTestResult(run.id, 0, { step_id: "nav", title: "Navigation", status: "inconclusive", summary: "Action limit", evidence: "Opened settings, but goal not confirmed." });
    await schema.recordTestResult(run.id, 1, {step_id:"extra-one",title:"Another unresolved check",status:"inconclusive",summary:"Insufficient evidence"});
    await schema.recordTestResult(run.id, 2, {step_id:"extra-two",title:"One more unresolved check",status:"inconclusive",summary:"Insufficient evidence"});
    const other = await schema.createRun(project.id, "https://app.example.test");
    await schema.createFinding({ runId: other.id, agentId: null, severity: "high", title: "FOREIGN_RUN_FINDING", reproSteps: null, screenshotUrl: null, consoleLogs: null, networkErrors: [] });
    const foreignId = (await sql`SELECT id FROM findings WHERE run_id=${other.id}`)[0].id;
    const marker = `preflight-${run.id}-0-0-testmarker`;
    await target.query("INSERT INTO widgets VALUES(7,$1,'original')", [marker]);
    await target.query("INSERT INTO widgets VALUES(8,$1,'configured check')", [config.checkMarker(run.id, configuredId)]);
    const fingerprint = (await target.query("SELECT md5(row_to_json(t)::text) AS fingerprint FROM widgets t WHERE id=7")).rows[0].fingerprint;
    const cleanupId = randomUUID(), proposal = { marker, record: { table: "widgets", key: "id", columns: ["name"], value: "7", fingerprint } };
    await sql`INSERT INTO run_database_cleanup(id,run_id,record_key,proposal) VALUES(${cleanupId}::uuid,${run.id},'record-key',${JSON.stringify(proposal)}::jsonb)`;
    const params = { params: Promise.resolve({ id: String(project.id), runId: String(run.id) }) };
    const requestGrant = (method = "POST", requestOrigin = new NextRequest(origin).nextUrl.origin) => new NextRequest(origin + "/grant", { method, headers: { origin: requestOrigin } });
    assert.equal((await grantRoute.POST(requestGrant("POST", "https://evil.test"), params)).status, 403);
    actor = "stranger";
    assert.equal((await grantRoute.POST(requestGrant(), params)).status, 404);
    actor = "owner-id";
    const issued = await grantRoute.POST(requestGrant(), params);
    assert.equal(issued.status, 200); assert.match(issued.headers.get("cache-control"), /no-store/);
    const prompt = (await issued.json()).prompt;
    const token = /Authorization: Bearer (pf_run_[\w-]{43})/.exec(prompt)[1];
    assert.ok(!JSON.stringify(await sql`SELECT * FROM run_agent_grants`).includes(token));
    const grant = await access.authenticateRunAgent("Bearer " + token);
    const client = await nativeClient(token);
    const available = await client.listTools();
    assert.ok(available.tools.some((t) => t.name === "inspect_cleanup"));
    assert.ok(!available.tools.some((t) => /execute|delete|approve/.test(t.name)));
    const overview = await call(client, "get_run");
    assert.equal(overview.run.id, run.id); assert.equal(overview.checks.length, 3);
    const first = await call(client,"get_run",{limit:1}); assert.equal(first.nextOffset,1);
    const last = await call(client,"get_run",{limit:1,offset:2}); assert.equal(last.nextOffset,null); assert.equal(last.checks.length,1);
    assert.ok(!JSON.stringify(overview).includes("DO_NOT_EXPORT_SESSION"));
    assert.ok(!JSON.stringify(overview).includes("private-db-secret"));
    assert.ok(!JSON.stringify(overview).includes("FOREIGN_RUN_FINDING"));
    assert.equal((await client.callTool({ name: "get_evidence", arguments: { key: `finding:${foreignId}` } })).isError, true);
    assert.equal((await client.callTool({ name: "get_run", arguments: { runId: other.id } })).isError, true);
    const observation = await call(client, "get_evidence", { key: overview.checks[0].key });
    const credentialLeak = await client.callTool({name:"record_review",arguments:{key:observation.key,evidenceHash:observation.evidenceHash,outcome:"inconclusive",basis:"browser_evidence",summary:token}});
    assert.equal(credentialLeak.isError,true);
    await call(client, "record_review", { key: observation.key, evidenceHash: observation.evidenceHash, outcome: "inconclusive", basis: "browser_evidence", summary: "The check stopped before evaluating its goal; this does not establish a bug." });
    const paths = await call(client, "get_source"); assert.deepEqual(paths.paths, ["app.ts"]);
    const files = await call(client, "get_source", { paths: ["app.ts"] }); assert.equal(files.files[0].content, sourceText);
    const cited = { key: observation.key, evidenceHash: observation.evidenceHash, outcome: "not_supported", basis: "source_inspection", summary: "The source contains expected page output, but the deployed version remains unverified.", citations: [{ path: "app.ts", start: 1, end: 3, sha: "a".repeat(40) }] };
    await call(client, "record_review", cited);
    assert.equal((await client.callTool({ name: "record_review", arguments: { ...cited, citations: [{ path: "invented.ts", start: 1, end: 3, sha: "a".repeat(40) }] } })).isError, true);
    await sql`UPDATE run_test_results SET summary='New evidence arrived' WHERE run_id=${run.id}`;
    assert.equal((await client.callTool({ name: "record_review", arguments: cited })).isError, true);
    const dbCheck = await call(client, "inspect_database_check", {key:`database:${configuredId}`});
    assert.equal(dbCheck.live.actual, 1); assert.equal(dbCheck.live.currentExpectationMet, true);
    await call(client,"record_review", {key:dbCheck.key,evidenceHash:dbCheck.evidenceHash,outcome:"supported",basis:"database_inspection",summary:"The current marker-bound predicate matches. The original browser submission remains unverified."});
    const clean = await call(client, "inspect_cleanup", { key: `cleanup:${cleanupId}` });
    assert.equal(clean.safeToCleanup, true); assert.equal(clean.live.fingerprintMatches, true);
    await call(client, "record_review", { key: clean.key, evidenceHash: clean.evidenceHash, outcome: "safe_to_cleanup", basis: "database_inspection", summary: "The exact uniquely marked record is unchanged and schema safeguards passed. Owner approval is still required." });
    assert.equal((await target.query("SELECT count(*)::int AS n FROM widgets")).rows[0].n, 2);
    assert.ok(queries.every((q) => !/\b(DELETE|INSERT|UPDATE|ALTER|DROP)\b/i.test(typeof q === "string" ? q : q.text)));
    const cleanup = load("lib/database-cleanup.ts", { ...deps, "@/lib/database-connections": connections, "@/lib/database-check-config": config, "@/lib/postgres-verification": postgres, "@/lib/database-records": records });
    assert.equal((await cleanup.listCleanup(run.id))[0].agent_review.outcome, "safe_to_cleanup");
    await target.query("UPDATE widgets SET note='changed after inspection' WHERE id=7");
    assert.equal((await client.callTool({ name: "record_review", arguments: { key: clean.key, evidenceHash: clean.evidenceHash, outcome: "safe_to_cleanup", basis: "database_inspection", summary: "Stale assessment must fail" } })).isError, true);
    const changed = await call(client, "inspect_cleanup", { key: clean.key }); assert.equal(changed.safeToCleanup, false);
    assert.equal((await client.callTool({ name: "record_review", arguments: { key: changed.key, evidenceHash: changed.evidenceHash, outcome: "safe_to_cleanup", basis: "database_inspection", summary: "A mismatched record must not be labeled safe" } })).isError, true);
    await target.exec("CREATE TABLE widget_children(id INT PRIMARY KEY,widget_id INT REFERENCES widgets(id) ON DELETE CASCADE)");
    const dependencies = await call(client,"inspect_cleanup",{key:clean.key});
    assert.equal(dependencies.live.schemaSafe,false); assert.equal(dependencies.safeToCleanup,false);
    console.log(JSON.stringify({ everyCheckAccessibleByPagination:true, savedBoundQueryReadOnly:true, cascadingDependenciesRejected:true, realSdkStreamableHttp: true, ownerAndRunScoped: true, credentialsOmitted: true, pinnedSourceCitationsChecked: true, staleEvidenceRejected: true, realReadOnlyPostgresInspection: true, changedRowsCannotBeMarkedSafe: true, assessmentsSavedWithoutDeleting: true }));

    await sql`INSERT INTO project_members(project_id,user_id,github_login,email) VALUES(${project.id},'member','member','member@example.test')`;
    const memberPrompt = (await access.createRunAgentGrant(project.id, run.id, "member", "member")).prompt;
    const memberToken = /Authorization: Bearer (pf_run_[\w-]{43})/.exec(memberPrompt)[1];
    const member = await nativeClient(memberToken);
    assert.ok(!(await member.listTools()).tools.some((t) => t.name === "inspect_cleanup"));
    assert.equal((await member.callTool({ name: "get_evidence", arguments: { key: clean.key } })).isError, true);
    await sql`DELETE FROM project_members WHERE project_id=${project.id} AND user_id='member'`;
    await assert.rejects(access.authenticateRunAgent("Bearer " + memberToken), /ended|revoked/);
    await sql`INSERT INTO project_members(project_id,user_id,github_login,email,joined_at) VALUES(${project.id},'member','member','member@example.test',NOW()+INTERVAL '1 second')`;
    await assert.rejects(access.authenticateRunAgent("Bearer " + memberToken), /ended|revoked/);
    await access.revokeRunAgentGrants(project.id, run.id, "owner-id");
    await assert.rejects(access.authenticateRunAgent("Bearer " + token), /revoked/);
    const again = (await access.createRunAgentGrant(project.id, run.id, "owner-id", "owner")).prompt;
    const expired = /Authorization: Bearer (pf_run_[\w-]{43})/.exec(again)[1];
    await sql`UPDATE run_agent_grants SET expires_at=NOW()-INTERVAL '1 second' WHERE revoked_at IS NULL`;
    await assert.rejects(access.authenticateRunAgent("Bearer " + expired), /expired/);
    const reviews = await tools.listAgentRunReviews(project.id, run.id, "owner-id"); assert.equal(reviews.length, 3);
    assert.deepEqual(await tools.listAgentRunReviews(project.id, run.id, "stranger"), []);
    assert.equal((await sql`SELECT status FROM run_test_results WHERE run_id=${run.id}`)[0].status, "inconclusive");
    assert.equal((await sql`SELECT status FROM run_database_cleanup WHERE id=${cleanupId}::uuid`)[0].status, "pending");
    console.log(JSON.stringify({ rejoiningCannotReviveOldGrant:true, removedCollaboratorDenied: true, ownerCanRevokeAccess: true, expiredGrantDenied: true, memberCannotInspectCleanup: true, assessmentsPersistAfterRevocation: true, originalResultsUnchanged: true, cleanupApprovalKept: true }));
  } finally {
    for (const c of clients) await c.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
    await app.close(); await target.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
