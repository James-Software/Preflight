require("node:module").registerHooks({
  resolve(s, c, next) {
    return next(s === "next/server" ? s + ".js" : s, c);
  },
});
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { PGlite } = require("@electric-sql/pglite");
const { NextRequest } = require("next/server");
const { load } = require("./load-module.cjs");
(async () => {
  const db = new PGlite();
  const bind = (parts, v) => ({
    text: parts.reduce(
      (s, p, i) => s + p + (i < v.length ? "$" + (i + 1) : ""),
      "",
    ),
    values: v,
  });
  const sql = async (parts, ...v) => {
    const q = bind(parts, v);
    return (await db.query(q.text, q.values)).rows;
  };
  sql.transaction = async (callback, options) => {
    assert.equal(options.isolationLevel, "Serializable");
    const queries = callback((parts, ...v) => bind(parts, v));
    return db.transaction(async (tx) => {
      const rows = [];
      for (const q of queries)
        rows.push((await tx.query(q.text, q.values)).rows);
      return rows;
    });
  };
  const deps = { "@/lib/db": { getSql: () => sql } };
  const schema = load("lib/schema.ts", deps);
  const deletion = load("lib/project-deletion.ts", {
    ...deps,
    "@/lib/schema": schema,
  });
  let actor = "owner",
    guest = false,
    closed = [],
    invalidated = [];
  const route = load("app/api/projects/[id]/route.ts", {
    ...deps,
    "@/auth": {
      auth: async () =>
        actor ? { user: { githubId: actor, isGuest: guest } } : null,
    },
    "@/lib/schema": schema,
    "@/lib/project-deletion": deletion,
    "@/lib/project-deletion-resources": {
      closeDeletedProjectResources: async (values) => closed.push(...values),
    },
    "next/cache": { revalidatePath: (...args) => invalidated.push(args) },
  });
  const request = (origin = "https://preflight.test") =>
    new NextRequest("https://preflight.test/api/projects/1", {
      method: "DELETE",
      headers: { origin },
    });
  try {
    await schema.ensureSchema();
    const main = await schema.createProject(
      "owner",
      "https://example.test",
      "owner/example",
      "Example",
    );
    const keep = await schema.createProject(
      "owner",
      "https://preflight.test",
      "owner/preflight",
      "Preflight",
    );
    const foreign = await schema.createProject(
      "someone",
      "https://other.test",
      "someone/other",
    );
    const run = await schema.createRun(main.id, "https://example.test");
    const archived = await schema.createRun(main.id, "https://example.test");
    await sql`UPDATE runs SET status='running' WHERE id=${run.id}`;
    await sql`UPDATE runs SET archived_at=NOW() WHERE id=${archived.id}`;
    const keepRun = await schema.createRun(keep.id, "https://preflight.test");
    const capture = randomUUID(),
      grant = randomUUID(),
      invitation = randomUUID(),
      group = randomUUID();
    await sql`INSERT INTO profile_captures(id,owner_github_id,project_id,name,origin,verification_path,verification_text,status,session_id) VALUES(${capture},'owner',${main.id},'Test','https://example.test','/','Signed in','active','fixture-browserbase')`;
    const profile = (
      await sql`INSERT INTO auth_profiles(owner_github_id,project_id,name,origin,encrypted_state) VALUES('owner',${main.id},'Account','https://example.test','encrypted-fixture') RETURNING id`
    )[0];
    await sql`UPDATE runs SET auth_profile_id=${profile.id} WHERE id=${keepRun.id}`;
    await sql`INSERT INTO test_users(id,capture_id,owner_github_id,project_id,name,email) VALUES('test:temporary',${capture},'owner',${main.id},'Test','fixture@example.test')`;
    const testWorkspace = await schema.createProject(
      "test:temporary",
      "https://example.test",
      "owner/example",
      "Test workspace",
    );
    const guestWorkspace = await schema.createProject(
      "owner",
      "https://example.test",
      "owner/example",
      "Guest workspace",
    );
    await sql`INSERT INTO guest_demo_links(token_hash,template_project_id) VALUES('fixture-invite',${main.id})`;
    await sql`INSERT INTO guest_demo_sessions(actor_id,link_hash,project_id,expires_at) VALUES('guest:fixture','fixture-invite',${guestWorkspace.id},NOW()+INTERVAL '1 day')`;
    await sql`INSERT INTO project_members(project_id,user_id,github_login,email) VALUES(${main.id},'member','member','member@example.test'),(${guestWorkspace.id},'guest:fixture','judge','')`;
    await schema.createRun(guestWorkspace.id, "https://example.test");
    await schema.createRun(testWorkspace.id, "https://example.test");
    await sql`INSERT INTO project_database_connections(project_id,origin,encrypted_config,check_count) VALUES(${main.id},'https://example.test','encrypted-fixture',1),(${keep.id},'https://preflight.test','keep-fixture',0)`;
    await sql`INSERT INTO project_invitations(id,project_id,email,token_hash) VALUES(${invitation},${main.id},'member@example.test','fixture-hash')`;
    await sql`INSERT INTO project_invite_verifications(invite_id,user_id) VALUES(${invitation},'member')`;
    await sql`INSERT INTO fix_pr_groups(id,run_id,finding_ids,branch) VALUES(${group},${run.id},'[]','fixture-branch')`;
    const agent = await schema.createAgent(run.id, {});
    const image = `https://fixture.public.blob.vercel-storage.com/preflight/runs/${run.id}/agent-0-step-0.jpg`;
    await schema.createFinding({
      runId: run.id,
      agentId: agent.id,
      title: "Bug",
      severity: "medium",
      reproSteps: "Fixture",
      screenshotUrl: image,
      consoleLogs: null,
      networkErrors: [],
    });
    const finding = (
      await sql`SELECT id FROM findings WHERE run_id=${run.id}`
    )[0];
    await sql`UPDATE findings SET pr_group_id=${group} WHERE id=${finding.id}`;
    const diagnosis = (
      await sql`INSERT INTO diagnoses(finding_id) VALUES(${finding.id}) RETURNING id`
    )[0];
    await sql`INSERT INTO pull_requests(diagnosis_id,pr_url) VALUES(${diagnosis.id},'https://github.com/owner/example/pull/1')`;
    await sql`INSERT INTO run_screenshots(id,run_id,content) VALUES(${randomUUID()},${run.id},decode('ffd8ff','hex'))`;
    await sql`INSERT INTO retired_screenshot_blobs(url,private_content) VALUES(${image},decode('ffd8ff','hex'))`;
    await sql`INSERT INTO run_test_results(run_id,agent_index,step_id,title,status,summary) VALUES(${run.id},0,'step','Step','passed','Done')`;
    await sql`INSERT INTO run_check_investigations(run_id,agent_index,step_id,budget_slot,worker_token,original_summary) VALUES(${run.id},0,'step',0,${randomUUID()},'Fixture')`;
    await sql`INSERT INTO run_database_checks(run_id,check_id,title,button_label) VALUES(${run.id},'fixture','Fixture','Save')`;
    await sql`INSERT INTO run_database_cleanup(id,run_id,record_key,proposal) VALUES(${randomUUID()},${run.id},'fixture','{}')`;
    await sql`INSERT INTO run_agent_grants(id,project_id,run_id,actor_id,actor_login,token_hash) VALUES(${grant},${main.id},${run.id},'owner','owner','fixture-agent')`;
    await sql`INSERT INTO run_agent_source_reads(grant_id,path,sha,line_count) VALUES(${grant},'app.ts','fixture',1)`;
    await sql`INSERT INTO run_agent_reviews(id,run_id,grant_id,target_key,target_title,outcome,basis,summary,evidence_hash) VALUES(${randomUUID()},${run.id},${grant},'fixture','Fixture','confirmed','browser','Fixture','fixture')`;
    await sql`INSERT INTO browser_sandbox_sessions(id,run_id,state,sandbox_name) VALUES(${randomUUID()},${run.id},'ready','fixture-sandbox')`;
    await sql`INSERT INTO credit_ledger(owner_github_id,amount,reason,run_id) VALUES('owner',5,'fixture',${run.id})`;
    const params = { params: Promise.resolve({ id: String(main.id) }) };
    actor = null;
    assert.equal((await route.DELETE(request(), params)).status, 401);
    actor = "owner";
    assert.equal(
      (await route.DELETE(request("https://evil.test"), params)).status,
      403,
    );
    actor = "member";
    assert.equal((await route.DELETE(request(), params)).status, 404);
    actor = "stranger";
    assert.equal((await route.DELETE(request(), params)).status, 404);
    actor = "guest:fixture";
    guest = true;
    assert.equal((await route.DELETE(request(), params)).status, 403);
    guest = false;
    actor = "owner";
    await db.exec(
      "CREATE TABLE deletion_guard(project_id int REFERENCES projects(id))",
    );
    await sql`INSERT INTO deletion_guard VALUES(${main.id})`;
    assert.equal((await route.DELETE(request(), params)).status, 500);
    assert.equal(
      (await schema.getRunReport(main.id, run.id, "owner")).findings.length,
      1,
    );
    assert.equal(closed.length, 0);
    await db.exec("DROP TABLE deletion_guard");
    const response = await route.DELETE(request(), params);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { deleted: true });
    assert.deepEqual(
      (await sql`SELECT id FROM projects ORDER BY id`).map((p) => p.id),
      [keep.id, foreign.id],
    );
    assert.deepEqual(
      (await sql`SELECT id FROM runs`).map((r) => r.id),
      [keepRun.id],
    );
    assert.equal(
      (await sql`SELECT auth_profile_id FROM runs WHERE id=${keepRun.id}`)[0]
        .auth_profile_id,
      null,
    );
    for (const table of [
      "agents",
      "findings",
      "diagnoses",
      "pull_requests",
      "fix_pr_groups",
      "run_agent_grants",
      "run_agent_reviews",
      "run_agent_source_reads",
      "run_test_results",
      "run_check_investigations",
      "run_database_checks",
      "run_database_cleanup",
      "run_screenshots",
      "browser_sandbox_sessions",
      "auth_profiles",
      "profile_captures",
      "test_users",
      "guest_demo_sessions",
      "guest_demo_links",
      "project_members",
      "project_invitations",
      "project_invite_verifications",
    ])
      assert.equal(
        (await db.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0]
          .count,
        0,
        table,
      );
    assert.equal(
      (
        await sql`SELECT count(*)::int AS count FROM project_database_connections WHERE project_id=${keep.id}`
      )[0].count,
      1,
    );
    assert.deepEqual((await sql`SELECT amount,run_id FROM credit_ledger`)[0], {
      amount: 5,
      run_id: null,
    });
    assert.equal(
      (
        await sql`SELECT private_content FROM retired_screenshot_blobs WHERE url=${image}`
      )[0].private_content,
      null,
    );
    assert.deepEqual(closed.map((r) => r.kind).sort(), [
      "browserbase",
      "sandbox",
    ]);
    assert.equal((await route.DELETE(request(), params)).status, 404);
    // A new import is a separate project with no inherited records.
    const imported = await schema.createProject(
      "owner",
      null,
      "owner/example",
      "Example",
    );
    assert.notEqual(imported.id, main.id);
    assert.equal((await schema.listRuns(imported.id)).length, 0);
    console.log(
      JSON.stringify({
        realPostgres: true,
        ownerOnly: true,
        csrfProtected: true,
        guestDenied: true,
        rollbackOnDependencyError: true,
        allProjectRecordsRemoved: true,
        derivedWorkspacesRemoved: true,
        otherProjectsPreserved: true,
        accountCreditsPreserved: true,
        privatePixelsRemoved: true,
        cloudResourcesClosed: true,
        reimportStartsClean: true,
      }),
    );
  } finally {
    await db.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
