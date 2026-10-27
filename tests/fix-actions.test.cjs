const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load-module.cjs");
const patches = load("lib/fix-patches.ts", {});
const diff = (path, from, to) =>
  `--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-${from}\n+${to}\n`;

test("independent fixes in the same file merge across shifted lines and shared context", () => {
  const original = "one\ntwo\nthree\nfour\n";
  const first = patches.parsePatch(
    "--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,4 @@\n one\n-two\n+second\n+inserted\n three\n",
  )[0];
  const second = patches.parsePatch(
    "--- a/file.ts\n+++ b/file.ts\n@@ -2,3 +2,3 @@\n two\n three\n-four\n+fourth\n",
  )[0];
  assert.equal(
    patches.mergePatches(original, [first, second]),
    "one\nsecond\ninserted\nthree\nfourth\n",
  );
  assert.equal(
    patches.mergePatches(original, [second, first]),
    "one\nsecond\ninserted\nthree\nfourth\n",
  );
  const conflicting = patches.parsePatch(
    "--- a/file.ts\n+++ b/file.ts\n@@ -2 +2 @@\n-two\n+different\n",
  )[0];
  assert.throws(
    () => patches.mergePatches(original, [first, conflicting]),
    /conflict/,
  );
  assert.equal(
    patches.applyPatch(
      "one\ntwo",
      patches.parsePatch(diff("file.ts", "one", "first"))[0],
    ),
    "first\ntwo",
  );
});

test("group patches apply sequential changes, creations, deletions and no-newline files", () => {
  const first = patches.parsePatch(diff("app.ts", "before", "middle"))[0];
  const second = patches.parsePatch(diff("app.ts", "middle", "after"))[0];
  assert.equal(
    patches.applyPatch(patches.applyPatch("before\n", first), second),
    "after\n",
  );
  const create = patches.parsePatch(
    "--- /dev/null\n+++ b/new.ts\n@@ -0,0 +1 @@\n+new\n",
  )[0];
  assert.equal(patches.applyPatch(null, create), "new\n");
  const remove = patches.parsePatch(
    "--- a/old.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-old\n",
  )[0];
  assert.equal(patches.applyPatch("old\n", remove), null);
  const noNewline = patches.parsePatch(
    diff("app.ts", "before", "after") + "\\ No newline at end of file\n",
  )[0];
  assert.equal(patches.applyPatch("before\n", noNewline), "after");
});

test("stale, malformed, renamed, binary and unsafe patches never silently apply", () => {
  assert.throws(
    () =>
      patches.applyPatch(
        "different\n",
        patches.parsePatch(diff("app.ts", "before", "after"))[0],
      ),
    /no longer applies/,
  );
  for (const text of [
    diff("../escape", "a", "b"),
    diff(".git/config", "a", "b"),
    "GIT binary patch\n",
    "--- a/old\n+++ b/new\n@@ -1 +1 @@\n-a\n+b",
    "```diff\n" + diff("app.ts", "a", "b") + "```",
    "--- a/app.ts\n+++ b/app.ts\n",
  ])
    assert.throws(() => patches.parsePatch(text));
  assert.throws(
    () =>
      patches.applyPatch(
        "a\n",
        patches.parsePatch(
          diff("app.ts", "a", "b").replace("-1 +1", "-1,2 +1"),
        )[0],
      ),
    /line counts/,
  );
});

function githubMock(t, options = {}) {
  const refs = new Map(),
    prs = [],
    trees = [],
    calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const path = new URL(url).pathname.replace("/repos/owner/app", "");
    const body = init.body && JSON.parse(init.body);
    calls.push({ path, method: init.method, body });
    assert.equal(
      new Headers(init.headers).get("Authorization"),
      "Bearer test-token",
    );
    if (path === "/pulls" && init.method === "GET") {
      const head = new URL(url).searchParams.get("head").replace("owner:", "");
      return Response.json(prs.filter((pr) => pr.branch === head));
    }
    if (path === "") return Response.json({ default_branch: "main" });
    if (path.startsWith("/git/ref/heads/")) {
      const branch = decodeURIComponent(path.slice("/git/ref/heads/".length));
      return branch === "main"
        ? Response.json({ object: { sha: "base" } })
        : refs.has(branch)
          ? Response.json(refs.get(branch))
          : Response.json({}, { status: 404 });
    }
    if (path === "/git/commits/base")
      return Response.json({ tree: { sha: "base-tree" } });
    if (path.startsWith("/contents/"))
      return Response.json({
        type: "file",
        encoding: "base64",
        size: 7,
        content: Buffer.from("before\n").toString("base64"),
      });
    if (path === "/git/trees/base-tree")
      return Response.json({
        tree: [1, 2, 3, 4].map((i) => ({
          path: `${i}.ts`,
          mode: "100644",
          type: "blob",
          sha: `blob-${i}`,
        })),
      });
    if (path === "/git/trees") {
      trees.push(body);
      return Response.json({ sha: `tree-${trees.length}` });
    }
    if (path === "/git/commits")
      return Response.json({ sha: `commit-${trees.length}` });
    if (path === "/git/refs") {
      const ref = { object: { sha: body.sha } };
      refs.set(body.ref.replace("refs/heads/", ""), ref);
      return Response.json(ref);
    }
    if (path === "/pulls" && init.method === "POST") {
      if (options.failOnce && !options.failed) {
        options.failed = true;
        return Response.json({}, { status: 503 });
      }
      const pr = {
        number: prs.length + 1,
        html_url: `https://github.com/owner/app/pull/${prs.length + 1}`,
        branch: body.head,
      };
      prs.push(pr);
      return Response.json(pr);
    }
    assert.fail(`Unexpected GitHub request: ${init.method} ${path}`);
  });
  return { refs, prs, trees, calls };
}
const prModule = () =>
  load("lib/fix-pull-request.ts", {
    "@/lib/fix-patches": patches,
    "@/lib/github": {
      GithubAuthError: class extends Error {},
      fetchGithub: (_ctx, url, init) => fetch(url, init),
    },
  });
const ctx = { login: "owner", accessToken: "test-token" };
const fix = (id) => ({
  id,
  title: `Fix ${id}`,
  patch_diff: diff(`${id}.ts`, "before", `after-${id}`),
});

test("four fixes selected in two groups create two isolated PRs; retries reuse them", async (t) => {
  const api = githubMock(t);
  const { openFixPullRequest } = prModule();
  const first = await openFixPullRequest(
    ctx,
    "owner/app",
    "preflight/group-a",
    [fix(1), fix(2)],
    "https://preflight.test/report",
  );
  const second = await openFixPullRequest(
    ctx,
    "owner/app",
    "preflight/group-b",
    [fix(3), fix(4)],
    "https://preflight.test/report",
  );
  const retry = await openFixPullRequest(
    ctx,
    "owner/app",
    "preflight/group-a",
    [fix(1), fix(2)],
    "https://preflight.test/report",
  );
  assert.equal(first.number, 1);
  assert.equal(second.number, 2);
  assert.equal(retry.number, 1);
  assert.deepEqual(
    api.trees.map((tree) => tree.tree.map((file) => file.path)),
    [
      ["1.ts", "2.ts"],
      ["3.ts", "4.ts"],
    ],
  );
  assert.equal(api.prs.length, 2);
  assert.equal(api.calls.filter((c) => c.method === "PATCH").length, 0);
  assert.ok([...api.refs.keys()].every((branch) => branch !== "main"));
});

test("a failed PR request resumes the existing branch without another commit", async (t) => {
  const api = githubMock(t, { failOnce: true });
  const { openFixPullRequest } = prModule();
  await assert.rejects(
    openFixPullRequest(
      ctx,
      "owner/app",
      "preflight/retry",
      [fix(1)],
      "https://preflight.test/report",
    ),
    /503/,
  );
  const pr = await openFixPullRequest(
    ctx,
    "owner/app",
    "preflight/retry",
    [fix(1)],
    "https://preflight.test/report",
  );
  assert.equal(pr.number, 1);
  assert.equal(api.trees.length, 1);
  await assert.rejects(
    openFixPullRequest(
      ctx,
      "someone-else/app",
      "branch",
      [fix(1)],
      "https://preflight.test/report",
    ),
    /repositories you own/,
  );
});

test("selection validation rejects malformed, oversized and empty selections", () => {
  const { parseFindingIds } = load("lib/fix-groups.ts", {
    "@/lib/db": {},
    "@/lib/schema": {},
  });
  assert.deepEqual(parseFindingIds([4, 2, 2, 1]), [1, 2, 4]);
  for (const ids of [
    [],
    [0],
    [-1],
    ["1"],
    null,
    [1.1],
    Array.from({ length: 101 }, (_, i) => i + 1),
  ])
    assert.throws(() => parseFindingIds(ids), /Select between/);
});

test("PR reservations and deletion require every selected owner-scoped row, never a subset", async () => {
  const queries = [];
  const sql = async (parts, ...values) => {
    const query = parts.join("?");
    queries.push({ query, values });
    if (/SELECT g\.\*/.test(query))
      return [{ id: "key", finding_ids: [1, 2], state: "pending" }];
    return [];
  };
  const { reserveFixGroup, deleteFindings } = load("lib/fix-groups.ts", {
    "@/lib/db": { getSql: () => sql },
    "@/lib/schema": { ensureSchema: async () => {} },
  });
  await assert.rejects(
    reserveFixGroup("owner", 1, 2, [1, 2], "key"),
    /unavailable/,
  );
  await assert.rejects(deleteFindings("owner", 1, 2, [1, 2]), /unavailable/);
  const mutations = queries.filter((q) => /WITH candidates/.test(q.query));
  assert.equal(mutations.length, 2);
  for (const { query } of mutations) {
    assert.match(query, /FOR UPDATE OF f/);
    assert.match(query, /COUNT\(\*\) FROM candidates\) = \?/);
    assert.match(query, /deleted_at IS NULL/);
  }
  assert.match(mutations[1].query, /p\.owner_github_id = \?/);
});

function actionRoute(options = {}) {
  const calls = [];
  class FixActionError extends Error {
    constructor(message, status = 409) {
      super(message);
      this.status = status;
    }
  }
  class FixPatchError extends Error {}
  const groups = load("lib/fix-groups.ts", {
    "@/lib/db": {},
    "@/lib/schema": {},
  });
  const POST = load("app/api/projects/[id]/runs/[runId]/findings/route.ts", {
    "@/lib/project-github": { projectGithubContext: async()=>ctx, ProjectGithubError: class extends Error{} },
    "@/lib/fix-github-grant": { saveFixGithubGrant: async () => {} },
    "@trigger.dev/sdk": {
      tasks: {
        trigger: async (...args) => {
          calls.push(["queue", ...args]);
        },
      },
    },
    "@/lib/trigger-client": { getTriggerClientConfig: () => ({}) },
    "@/lib/github-credentials": {
      GithubRenewalUnavailable: class extends Error {},
    },
    "next/cache": { revalidatePath: () => {} },
    "@/auth": {
      auth: async () =>
        options.signedOut ? null : { user: { githubId: "100" } },
    },
    "@/lib/schema": {
      getProject: async (id, owner) => {
        calls.push(["project", id, owner]);
        return options.otherOwner ? null : { repo_full_name: "owner/app" };
      },
      getRunReport: async () => ({
        run: { repo_full_name: options.runRepo || "owner/app" },
        findings: [fix(1), fix(2), fix(3), fix(4)].map((f) =>
          options.noPatch ? { ...f, patch_diff: null } : f,
        ),
      }),
    },
    "@/lib/github": {
      GithubAuthError: class extends Error {},
      getGithubContext: async () => ctx,
    },
    "@/lib/fix-groups": {
      acquireFixGroup: async () => {},
      releaseFixGroupLease: async () => {},
      FixActionError,
      parseFindingIds: groups.parseFindingIds,
      reserveFixGroup: async (owner, projectId, runId, ids, key) => {
        calls.push(["reserve", ids]);
        return { id: key, branch: `preflight/${key}` };
      },
      completeFixGroup: async (...args) => calls.push(["complete", ...args]),
      releaseInvalidFixGroup: async (key) => calls.push(["release", key]),
      deleteFindings: async (...args) => calls.push(["delete", ...args]),
    },
    "@/lib/fix-pull-request": {
      FixPatchError,
      openFixPullRequest: async (...args) => {
        calls.push(["repo", args[1]]);
        calls.push(["pr", args[3].map((f) => f.id)]);
        if (options.patchError)
          throw new FixPatchError("The patch no longer applies.");
        if (options.transientError)
          throw new Error("GitHub is temporarily unavailable.");
        return { html_url: "https://github.com/owner/app/pull/5", number: 5 };
      },
    },
  }).POST;
  const { NextRequest } = require("next/server");
  return {
    calls,
    post: (body, origin = "https://preflight.test") =>
      POST(
        new NextRequest(
          "https://preflight.test/api/projects/1/runs/2/findings",
          {
            method: "POST",
            headers: { origin, "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        ),
        { params: Promise.resolve({ id: "1", runId: "2" }) },
      ),
  };
}
const key = "00000000-0000-4000-8000-000000000001";
test("finding actions reject foreign origins, signed-out sessions, other owners and foreign IDs before mutations", async () => {
  for (const [options, body, origin, status] of [
    [{}, { action: "delete", findingIds: [1] }, "https://other.test", 403],
    [
      { signedOut: true },
      { action: "delete", findingIds: [1] },
      undefined,
      401,
    ],
    [
      { otherOwner: true },
      { action: "delete", findingIds: [1] },
      undefined,
      404,
    ],
    [{}, { action: "open-pr", findingIds: [99], groupId: key }, undefined, 409],
  ]) {
    const route = actionRoute(options);
    assert.equal((await route.post(body, origin)).status, status);
    assert.ok(route.calls.every((c) => c[0] === "project"));
  }
});
test("the action endpoint persists the exact PR group and deletes only selected IDs", async () => {
  const route = actionRoute();
  assert.equal(
    (await route.post({ action: "open-pr", findingIds: [2, 1], groupId: key }))
      .status,
    200,
  );
  assert.deepEqual(route.calls.find((c) => c[0] === "pr")[1], [1, 2]);
  assert.deepEqual(
    route.calls.find((c) => c[0] === "complete"),
    ["complete", key, "https://github.com/owner/app/pull/5", 5],
  );
  assert.equal(
    (await route.post({ action: "delete", findingIds: [3, 4] })).status,
    200,
  );
  assert.deepEqual(
    route.calls.find((c) => c[0] === "delete"),
    ["delete", "100", 1, 2, [3, 4]],
  );
});
test("invalid patches release their reservation; transient failures retain a resumable group", async () => {
  const invalid = actionRoute({ patchError: true });
  const response = await invalid.post({
    action: "open-pr",
    findingIds: [1],
    groupId: key,
  });
  assert.equal(response.status, 409);
  assert.deepEqual(
    invalid.calls.find((c) => c[0] === "release"),
    ["release", key],
  );
  assert.equal((await response.json()).groupId, undefined);
  const transient = actionRoute({ transientError: true });
  const retry = await transient.post({
    action: "open-pr",
    findingIds: [1],
    groupId: key,
  });
  assert.equal(retry.status, 502);
  assert.equal((await retry.json()).groupId, key);
  assert.ok(
    transient.calls.every((c) => c[0] !== "release" && c[0] !== "complete"),
  );
});

test("fix PRs keep the run's original repository after the project repository changes", async () => {
  const route = actionRoute({ runRepo: "owner/original" });
  const response = await route.post({
    action: "open-pr",
    findingIds: [1],
    groupId: key,
  });
  assert.equal(response.status, 200);
  assert.deepEqual(
    route.calls.find((c) => c[0] === "repo"),
    ["repo", "owner/original"],
  );
});

test("unpatched selected findings queue fix preparation rather than requiring a pre-existing patch", async () => {
  const route = actionRoute({ noPatch: true });
  const response = await route.post({
    action: "open-pr",
    findingIds: [1, 2],
    groupId: key,
  });
  assert.equal(response.status, 202);
  assert.equal((await response.json()).queued, true);
  const queued = route.calls.find((call) => call[0] === "queue");
  assert.equal(queued[1], "prepare-fix-pr");
  assert.deepEqual(queued[2], {
    groupId: key,
    runId: 2,
    projectId: 1,
    owner: "100",
  });
  assert.ok(!route.calls.some((call) => call[0] === "pr"));
});
