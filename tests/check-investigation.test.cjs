const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load-module.cjs");
const policy = load("lib/check-investigation.ts", {
  "@/lib/finding-evidence": load("lib/finding-evidence.ts", {}),
});
const origin = "https://app.test";

test("follow-up policy refuses submissions, destructive actions and write requests", () => {
  for (const name of ["Create project", "Save", "Pay now", "Delete", "Connect GitHub"])
    assert.equal(policy.retryActionAllowed({ action: "click", role: "button", name }, origin), false);
  assert.equal(policy.retryActionAllowed({ action: "press", key: "Enter" }, origin), false);
  assert.equal(policy.retryActionAllowed({ action: "goto", value: origin + "/terms" }, origin), true);
  assert.equal(policy.retryActionAllowed({ action: "done" }, origin), true);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"])
    assert.equal(policy.retryRequestAllowed(method, origin + "/api/projects", origin), false);
  for (const url of [origin + "/logout", origin + "/api/remove", origin + "/?action=delete", "https://github.com/login"])
    assert.equal(policy.retryRequestAllowed("GET", url, origin), false);
  assert.equal(policy.retryRequestAllowed("GET", origin + "/api/projects", origin), true);
});

test("source inspection excludes secrets, binaries, path traversal and dependencies", () => {
  for (const path of [".env", "config/.env.local", "lib/credentials.ts", "lib/private-key.ts", "node_modules/a.ts", "x/../auth.ts", "public/a.js", "service-account.json", "a\\b.ts", ".git/config", "key.pem", "photo.png"])
    assert.equal(policy.investigationSourcePath(path), false, path);
  for (const path of ["auth.ts", "app/api/projects/route.ts", "prisma/schema.prisma", "tests/project.test.ts", "package.json"])
    assert.equal(policy.investigationSourcePath(path), true, path);
});

test("code conclusions require exact line citations; invented or partial citations are rejected", () => {
  const files = { "auth.ts": "const allowed = false;\nreturn allowed;\n" };
  const review = { conclusion: "blocked", summary: "An authorization prerequisite is required.", retestGuidance: "Inspect the page.", citations: [{ path: "auth.ts", start: 1, end: 2, quote: "const allowed = false;\nreturn allowed;" }] };
  assert.equal(policy.validateCodeReview(review, files).conclusion, "blocked");
  for (const citation of [
    { ...review.citations[0], path: "invented.ts" },
    { ...review.citations[0], start: 0 },
    { ...review.citations[0], end: 99 },
    { ...review.citations[0], quote: "return true;" },
  ]) assert.throws(() => policy.validateCodeReview({ ...review, citations: [citation] }, files), /cited source/);
  assert.throws(() => policy.validateCodeReview({ ...review, citations: [] }, files), /requires source citations/);
  assert.throws(() => policy.validateCodeReview({ ...review, conclusion: "confirmed_bug" }, files), /Invalid/);
});

test("the source broker stays pinned, checks owner authorization and never returns credentials", async (t) => {
  const oldKey = process.env.PROFILE_ENCRYPTION_KEY;
  process.env.PROFILE_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
  t.after(() => { if (oldKey === undefined) delete process.env.PROFILE_ENCRYPTION_KEY; else process.env.PROFILE_ENCRYPTION_KEY = oldKey; });
  let authorized = true, login = "owner", sha = "a".repeat(40), deployedSha = sha;
  const calls = [];
  const broker = load("lib/investigation-source.ts", {
    "@/lib/db": { getSql: () => async () => authorized ? [{ repo_full_name: "owner/app", target_sha: sha, target_url: origin, owner_github_id: "123" }] : [] },
    "@/lib/github-credentials": { loadGithubCredentials: async () => ({ login, accessToken: "private-github-token" }) },
    "@/lib/auth-profile-state": load("lib/auth-profile-state.ts", {}),
    "@/lib/check-investigation": policy,
    "@/lib/github": { fetchGithub: async (ctx, url) => {
      assert.equal(ctx.accessToken, "private-github-token"); calls.push(url);
      if (url.includes("/git/trees/")) {
        assert.ok(url.includes(sha));
        return Response.json({ tree: [
          { type: "blob", mode: "100644", path: "auth.ts", size: 10 },
          { type: "blob", mode: "120000", path: "link.ts", size: 10 },
          { type: "blob", mode: "100644", path: ".env", size: 10 },
        ] });
      }
      if (url.includes("/contents/")) {
        assert.ok(url.endsWith(`?ref=${sha}`));
        return Response.json({ type: "file", encoding: "base64", content: Buffer.from("const x=1;").toString("base64"), size: 10 });
      }
      if (url.includes("/statuses")) return Response.json([{ state: "success", environment_url: origin }]);
      if (url.includes("/deployments")) return Response.json([{ id: 1, sha: deployedSha }]);
      throw new Error("Unexpected GitHub request");
    } },
  });
  const input = { runId: 2, agentIndex: 0, stepId: "nav", token: "11111111-1111-1111-1111-111111111111", timestamp: Date.now() };
  const tree = await broker.investigationSource(input);
  assert.deepEqual(tree.paths, ["auth.ts"]);
  assert.equal(tree.deploymentVerified, true);
  deployedSha = "b".repeat(40);
  assert.equal((await broker.investigationSource(input)).deploymentVerified, false);
  const snapshot = await broker.investigationSource({ ...input, paths: ["auth.ts"] });
  assert.equal(snapshot.files["auth.ts"], "const x=1;");
  assert.ok(!JSON.stringify(snapshot).includes("private-github-token"));
  await assert.rejects(broker.investigationSource({ ...input, paths: [".env"] }), /Invalid/);
  await assert.rejects(broker.investigationSource({ ...input, paths: ["link.ts"] }), /eligible/);
  await assert.rejects(broker.investigationSource({ ...input, timestamp: Date.now() - 61000 }), /expired|Invalid/);
  const before = calls.length;
  sha = null;
  await assert.rejects(broker.investigationSource(input), /pinned source/);
  sha = "a".repeat(40); authorized = false;
  await assert.rejects(broker.investigationSource(input), /pinned source/);
  authorized = true; login = "other-owner";
  await assert.rejects(broker.investigationSource(input), /authorized/);
  assert.equal(calls.length, before);
  const body = JSON.stringify(input), signature = broker.signInvestigationRequest(body);
  assert.equal(broker.validInvestigationRequest(body, signature), true);
  assert.equal(broker.validInvestigationRequest(body + " ", signature), false);
});

test("reports show source hypotheses separately from confirmed browser findings", () => {
  const React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
  const Results = load("components/TestStepResults.tsx", {}).default;
  const html = renderToStaticMarkup(React.createElement(Results, { results: [{
    step_id: "nav", title: "Navigation", status: "inconclusive", summary: "No defect confirmed.",
    investigation: { state: "completed", conclusion: "bug_hypothesis", summary: "Possible handler mismatch.", source_sha: "a".repeat(40), deployment_verified: false,
      retest_status: "inconclusive", citations: [{ path: "app/projects.ts", start: 2, end: 4 }] },
  }] }));
  assert.match(html, /Possible cause in source/);
  assert.match(html, /deployed version could not be verified/);
  assert.match(html, /app\/projects.ts:2–4/);
  assert.match(html, /Not confirmed/);
  assert.doesNotMatch(html, /Approve|Needs review/);
});
