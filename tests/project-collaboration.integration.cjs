require("node:module").registerHooks({ resolve(s, c, next) { return next(s === "next/server" ? s + ".js" : s, c); } });
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { NextRequest } = require("next/server");
const { PGlite } = require(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const { load } = require("./load-module.cjs");
(async () => {
  process.env.PROFILE_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.RESEND_API_KEY = "fake-mail-key";
  process.env.INVITE_FROM_EMAIL = "PreFlight <invites@example.test>";
  const db = new PGlite();
  const sql = async (parts, ...v) => { let q = parts[0]; v.forEach((_, i) => q += `$${i + 1}` + parts[i + 1]); return (await db.query(q, v)).rows; };
  const deps = { "@/lib/db": { getSql: () => sql } };
  const schema = load("lib/schema.ts", deps), state = load("lib/auth-profile-state.ts", {});
  let actor = "owner-id", emailStatus = 200, verifiedEmails = [], githubCalls = 0;
  let openedBranch = null;
  const emails = [];
  const saved = { loadGithubCredentials: async (id) => ({ login: id === "owner-id" ? "owner" : "bob", accessToken: id === "owner-id" ? "owner-github-secret" : "member-github-secret" }), savedGithubOwner: async (id) => id };
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (raw, init = {}) => {
    const url = new URL(raw);
    if (url.origin === "https://api.resend.com") {
      assert.equal(new Headers(init.headers).get("authorization"), "Bearer fake-mail-key");
      const email = JSON.parse(init.body); emails.push(email);
      return emailStatus === 200 ? Response.json({ id: randomUUID() }) : new Response("private-provider-error", { status: emailStatus });
    }
    if (url.pathname === "/user/emails") return Response.json(verifiedEmails);
    assert.equal(url.origin, "https://api.github.com"); githubCalls++;
    assert.equal(new Headers(init.headers).get("authorization"), "Bearer owner-github-secret");
    assert.equal(init.redirect, "error");
    if (url.pathname.endsWith("/branches/main")) return Response.json({ name: "main", commit: { sha: "a".repeat(40) } });
    if (url.pathname.endsWith("/branches")) return Response.json([{ name: "main" }]);
    if (url.pathname.endsWith("/pulls") && init.method === "POST") {
      openedBranch = JSON.parse(init.body).head;
      return Response.json({ number: 42, html_url: "https://github.com/owner/private/pull/42" });
    }
    if (url.pathname.endsWith("/pulls")) return Response.json([]);
    if (url.pathname.includes("/git/ref/heads/")) return Response.json({ object: { sha: "existing-retry-branch" } });
    return Response.json({ default_branch: "main", full_name: "owner/private", owner: { login: "owner" } });
  };
  const mail = load("lib/project-mail.ts", { "@/lib/site": { SITE_URL: "https://www.trypreflight.dev" } });
  const collaboration = load("lib/project-collaboration.ts", { ...deps, "@/lib/schema": schema, "@/lib/github-credentials": saved, "@/lib/project-mail": mail, "@/lib/site": { SITE_URL: "https://www.trypreflight.dev" } });
  const access = load("lib/project-repository-access.ts", deps);
  const github = load("lib/github.ts", { "@/lib/github-credentials": saved, "@/lib/project-repository-access": access, "next-auth/jwt": { getToken: async () => ({ sub: actor }) } });
  const projectGithub = load("lib/project-github.ts", { "@/lib/github": github, "@/lib/github-credentials": saved, "@/lib/schema": schema, "@/lib/project-repository-access": access });
  const grant = load("lib/fix-github-grant.ts", { ...deps, "@/lib/auth-profile-state": state });
  const profile = load("lib/auth-profiles.ts", { ...deps, "@/lib/schema": schema, "@/lib/auth-profile-state": state, "@/lib/test-user-issuer": {} });
  const caller = { auth: async () => ({ user: { githubId: actor, githubLogin: actor === "owner-id" ? "owner" : "bob" } }) };
  const route = load("app/api/projects/[id]/collaborators/route.ts", { "@/auth": caller, "@/lib/project-collaboration": collaboration });
  const joinRoute = load("app/api/project-invites/[token]/route.ts", { "@/auth": caller, "@/lib/project-collaboration": collaboration });
  const request = (path, body, method = "POST", origin = "https://www.trypreflight.dev") => new NextRequest("https://www.trypreflight.dev" + path, { method, headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    await schema.ensureSchema();
    const project = await schema.createProject("owner-id", "https://app.example.test", "owner/private", "Our app");
    const other = await schema.createProject("someone-else", "https://other.example.test", "someone/other");
    const params = { params: Promise.resolve({ id: String(project.id) }) };
    assert.equal((await route.POST(request("/", { email: "bob@example.test" }, "POST", "https://evil.test"), params)).status, 403);
    actor = "stranger";
    assert.equal((await route.POST(request("/", { email: "bob@example.test" }), params)).status, 400);
    assert.equal(emails.length, 0);
    actor = "owner-id";
    assert.equal((await route.POST(request("/", { email: "Bob@Example.test" }), params)).status, 200);
    assert.equal(emails.length, 1);
    assert.equal(emails[0].to[0], "bob@example.test");
    const token = /project-invite\/([\w-]{43})/.exec(emails[0].text)[1];
    const invitation = (await sql`SELECT * FROM project_invitations WHERE project_id=${project.id}`)[0];
    assert.ok(!JSON.stringify(invitation).includes(token));
    assert.equal(await collaboration.canJoinWithProjectInvite(token), true);
    assert.equal(await collaboration.hasProjectMembership("member-id"), false);
    actor = "member-id";
    assert.equal(await schema.getProject(project.id, actor, "member"), null);
    assert.equal((await route.GET(request("/", {}), params)).status, 404);
    const context = { params: Promise.resolve({ token }) };
    const firstJoin = await joinRoute.POST(request("/", {}), context);
    assert.deepEqual(await firstJoin.json(), { requiresCode: true });
    const code = /Your code is (\d{6})/.exec(emails.at(-1).text)[1];
    assert.equal(await schema.getProject(project.id, actor, "member"), null);
    assert.equal((await joinRoute.POST(request("/", { code: "000000" }), context)).status, 400);
    assert.equal((await joinRoute.POST(request("/", { code }), context)).status, 200);
    assert.equal(await collaboration.hasProjectMembership("member-id"), true);
    assert.equal((await schema.getProject(project.id, actor, "member")).role, "member");
    assert.equal(await schema.getProject(project.id, actor), null); // owner-only default is preserved
    assert.equal(await schema.getProject(other.id, actor, "member"), null);
    assert.deepEqual((await schema.listProjects(actor)).map((p) => p.id), [project.id]);
    assert.equal((await route.POST(request("/", { email: "extra@example.test" }), params)).status, 400);
    assert.equal((await route.DELETE(request("/", { userId: "owner-id" }, "DELETE"), params)).status, 400);
    const memberList = await collaboration.projectCollaboration(project.id, actor);
    assert.equal(memberList.owner, false); assert.deepEqual(memberList.invitations, []);
    console.log(JSON.stringify({ emailDeliveredThroughFixture: true, tokenHashedAtRest: true, emailProofBeforeMembership: true, sharedProjectVisible: true, foreignProjectDenied: true, memberCannotInviteOrManageOwner: true }));

    const ctx = await projectGithub.projectGithubContext(request("/", {}), await schema.getProject(project.id, actor, "member"), actor);
    await github.fetchGithub(ctx, "https://api.github.com/repos/owner/private/branches/main");
    const before = githubCalls;
    for (const path of ["/user/repos", "/repos/owner/another", "/repos/owner/private/%2e%2e%2fother"])
      await assert.rejects(github.fetchGithub(ctx, "https://api.github.com" + path), /outside/);
    assert.equal(githubCalls, before);
    const sealed = grant.sealFixGithubGrant(randomUUID(), actor, ctx); // test the serializable scope separately below
    assert.ok(!sealed.includes("owner-github-secret"));
    const group = randomUUID();
    const restored = grant.openFixGithubGrant(grant.sealFixGithubGrant(group, actor, ctx), group, actor);
    assert.deepEqual(restored.projectGrant, ctx.projectGrant);
    console.log(JSON.stringify({ ownerRepositoryConnectionDelegated: true, unrelatedRepositoriesDeniedBeforeNetwork: true, encodedTraversalDenied: true, workerGrantRetainsScope: true }));

    const ownerProfile = await profile.createAuthProfile("owner-id", { name: "Shared test account", origin: "https://app.example.test", verificationPath: "/dashboard", session: JSON.stringify([{ name: "session", value: "private-owner-cookie", domain: "app.example.test", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]), headers: "{}" }, project.id);
    await assert.rejects(profile.createAuthProfile(actor, { name: "Bad", origin: "https://app.example.test", session: "[]", headers: "{}" }, project.id), /unavailable/);
    const targets = load("lib/run-targets.ts", { "@/lib/github": github });
    const options = load("app/api/projects/[id]/run-options/route.ts", { "@/auth": caller, "@/lib/schema": schema, "@/lib/github": github, "@/lib/project-github": projectGithub, "@/lib/github-credentials": { GithubRenewalUnavailable: Error }, "@/lib/auth-profiles": profile, "@/lib/run-targets": targets, "@/lib/database-connections": { databaseSummary: async () => null } });
    const optionsResult = await options.GET(new NextRequest("https://www.trypreflight.dev/api/projects/1/run-options"), params);
    assert.equal(optionsResult.status, 200);
    const choices = await optionsResult.json();
    assert.equal(choices.canManageProfiles, false); assert.equal(choices.profiles[0].id, ownerProfile.id);
    assert.ok(!JSON.stringify(choices).includes("private-owner-cookie"));
    const queued = [];
    const runsRoute = load("app/api/projects/[id]/runs/route.ts", { "@/auth": caller, "@/lib/schema": schema, "@/lib/project-github": projectGithub, "@/lib/github": github, "@/lib/github-credentials": { GithubRenewalUnavailable: Error }, "@/lib/run-targets": targets, "@/lib/auth-profiles": profile, "@/lib/auth-profile-state": state, "@/lib/database-connections": {}, "@/lib/database-check-config": {}, "@/lib/trigger-client": { getTriggerClientConfig: () => ({}), swarmStartError: () => "Queue unavailable" }, "@trigger.dev/sdk": { tasks: { trigger: async (...args) => queued.push(args) } } });
    const started = await runsRoute.POST(request("/", { target: { type: "branch", ref: "main" }, profileId: ownerProfile.id }), params);
    assert.equal(started.status, 200);
    const run = (await started.json()).run;
    assert.equal(queued.length, 1);
    assert.ok(!JSON.stringify(queued).includes("cookie"));
    assert.equal((await profile.getRunAuthentication(run.id)).state.cookies[0].value, "private-owner-cookie");
    assert.ok(await schema.getRunReport(project.id, run.id, actor));
    assert.equal(await schema.getRunReport(project.id, run.id, "stranger"), null);
    await schema.updateRunStatus(run.id, "done");
    assert.equal(await schema.setRunArchived(run.id, project.id, actor, true), true);
    const findingInput = { runId: run.id, agentId: null, title: "Example bug", severity: "medium", reproSteps: "Observed", screenshotUrl: null, consoleLogs: null, networkErrors: [] };
    await schema.createFinding(findingInput);
    const finding = (await sql`SELECT id FROM findings WHERE run_id=${run.id}`)[0];
    const groups = load("lib/fix-groups.ts", { ...deps, "@/lib/schema": schema });
    const reserved = await groups.reserveFixGroup(actor, project.id, run.id, [finding.id], randomUUID());
    assert.deepEqual(reserved.finding_ids, [finding.id]);
    await sql`INSERT INTO diagnoses(finding_id,patch_diff,confidence) VALUES(${finding.id},'--- a/app.ts\n+++ b/app.ts\n@@ -1 +1 @@\n-old\n+fixed','proposed')`;
    await grant.saveFixGithubGrant(reserved.id, actor, ctx);
    const pr = load("lib/fix-pull-request.ts", { "@/lib/github": github, "@/lib/fix-patches": load("lib/fix-patches.ts", {}) });
    const worker = load("src/trigger/prepare-fix-pr.ts", {
      ...deps, "@/lib/schema": schema, "@/lib/fix-github-grant": grant, "@/lib/fix-groups": groups,
      "@/lib/generate-fix-patches": { generateFixPatches: async () => { throw new Error("Stored patch should be reused"); } },
      "@/lib/fix-pull-request": pr, "@/lib/site": { SITE_URL: "https://www.trypreflight.dev" }, "@trigger.dev/sdk": { task: (config) => config },
    }).prepareFixPr;
    const opened = await worker.run({ groupId: reserved.id, runId: run.id, projectId: project.id, owner: actor });
    assert.equal(opened.prUrl, "https://github.com/owner/private/pull/42");
    assert.equal(openedBranch, reserved.branch);
    assert.equal((await sql`SELECT state FROM fix_pr_groups WHERE id=${reserved.id}::uuid`)[0].state, "open");
    console.log(JSON.stringify({ sharedProfilesListedWithoutCredentials: true, sharedRunQueued: true, ownerEncryptedSessionReused: true, memberReadsReport: true, memberArchivesRun: true, memberOpensFixPrViaWorker: true }));

    actor = "owner-id";
    await collaboration.removeProjectAccess(project.id, actor, { userId: "member-id" });
    assert.equal(await schema.getProject(project.id, "member-id", "member"), null);
    assert.equal((await schema.listProjects("member-id")).length, 0);
    await assert.rejects(github.fetchGithub(restored, "https://api.github.com/repos/owner/private"), /access.*ended/);
    await assert.rejects(schema.createRun(project.id, "https://app.example.test", { requestedBy: "member-id" }), /Failed/);
    await assert.rejects(collaboration.joinProject(token, "member-id", "bob"), /revoked/);
    console.log(JSON.stringify({ removalRevokesReadAndRunAccess: true, queuedWorkerGrantCannotOutliveMembership: true, removedMemberCannotReuseInvite: true }));

    await collaboration.inviteProjectMember(project.id, actor, "other@example.test");
    const otherToken = /project-invite\/([\w-]{43})/.exec(emails.at(-1).text)[1];
    verifiedEmails = [{ email: "other@example.test", verified: true }];
    const accepted = await collaboration.joinProject(otherToken, "other-member", "other");
    assert.equal(accepted.projectId, project.id);
    await collaboration.inviteProjectMember(project.id, actor, "expired@example.test");
    const expiredToken = /project-invite\/([\w-]{43})/.exec(emails.at(-1).text)[1];
    await sql`UPDATE project_invitations SET expires_at=NOW()-INTERVAL '1 minute' WHERE email='expired@example.test'`;
    assert.equal(await collaboration.projectInviteInfo(expiredToken), null);
    emailStatus = 429;
    await assert.rejects(collaboration.inviteProjectMember(project.id, actor, "failure@example.test"), /sending limit/);
    assert.equal((await sql`SELECT delivery FROM project_invitations WHERE email='failure@example.test'`)[0].delivery, "failed");
    console.log(JSON.stringify({ githubVerifiedEmailSkipsExtraCode: true, expiredInvitesDenied: true, deliveryFailureReportedHonestly: true }));
  } finally { globalThis.fetch = previousFetch; await db.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
