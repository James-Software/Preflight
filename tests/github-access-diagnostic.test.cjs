const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { load } = require("./load-module.cjs");
class AgentAccessError extends Error {}
const grant = {
  actor_id: "owner",
  owner_id: "owner",
  project_id: 28,
  run_id: 32,
};
function fixture(options = {}) {
  const calls = [];
  const deps = {
    "@/lib/run-agent-access": { AgentAccessError },
    "@/lib/db": { getSql: () => async () => [] },
    "@/lib/schema": {
      getProject: async () =>
        options.noAccess
          ? null
          : { id: 28, owner_github_id: "owner", repo_full_name: "owner/app" },
      getRunReport: async () => ({
        run: {
          repo_full_name: options.changedRepo ? "owner/old" : "owner/app",
        },
      }),
    },
    "@/lib/github-credentials": {
      loadGithubCredentials: async () => ({
        login: "owner",
        accessToken: "DO_NOT_EXPORT_TOKEN",
      }),
    },
    "@/lib/github": {
      GITHUB_APP_SLUG: "preflight-qa",
      fetchGithub: async (ctx, url, init) => {
        assert.equal(ctx.accessToken, "DO_NOT_EXPORT_TOKEN");
        assert.equal(init.method, "GET");
        assert.equal(init.redirect, "error");
        const u = new URL(url);
        calls.push(u.pathname);
        assert.equal(u.origin, "https://api.github.com");
        if (u.pathname === "/apps/preflight-qa")
          return Response.json({
            client_id: process.env.AUTH_GITHUB_ID,
            permissions: { contents: "write", pull_requests: "write" },
            private_key: "DO_NOT_EXPORT_KEY",
          });
        if (u.pathname === "/repos/owner/app")
          return Response.json({
            permissions: { push: true },
            archived: false,
          });
        if (u.pathname === "/repos/owner/app/pulls") return Response.json([]);
        if (u.pathname === "/user/installations")
          return Response.json({
            total_count: 2,
            installations: [
              {
                id: 99,
                app_slug: "another-app",
                account: { login: "owner" },
                permissions: { contents: "write" },
              },
              {
                id: 42,
                app_slug: "preflight-qa",
                account: { login: "owner" },
                permissions: {
                  contents: options.approved ? "write" : "read",
                  pull_requests: "write",
                },
              },
            ],
          });
        if (u.pathname === "/user/installations/42/repositories")
          return options.unavailable
            ? Response.json({}, { status: 403 })
            : Response.json({
                total_count: 1,
                repositories: [
                  { full_name: options.excluded ? "owner/other" : "owner/app" },
                ],
              });
        assert.fail(url);
      },
    },
  };
  return { ...load("lib/github-access-diagnostic.ts", deps), calls, deps };
}
test("GitHub access diagnostic distinguishes registered permissions, approved installation and repository selection without credentials or writes", async () => {
  process.env.AUTH_GITHUB_ID = "public-client-id";
  for (const options of [
    {},
    { approved: true },
    { excluded: true },
    { unavailable: true },
  ]) {
    const f = fixture(options),
      result = await f.inspectGithubAccess(grant);
    assert.equal(result.app.configuredLoginMatches, true);
    assert.equal(result.app.registeredPermissions.contents, "write");
    assert.equal(
      result.installation.approvedPermissions.contents,
      options.approved ? "write" : "read",
    );
    assert.equal(
      result.installation.repositoryIncluded,
      options.unavailable ? null : !options.excluded,
    );
    assert.equal(
      result.installation.settingsUrl,
      "https://github.com/settings/installations/42",
    );
    assert.doesNotMatch(JSON.stringify(result), /DO_NOT_EXPORT|another-app/);
    assert.equal(f.calls.length, 5);
  }
});
test("GitHub access diagnostic denies members, guests, revoked access and changed repositories before provider calls", async () => {
  for (const actor of [
    { ...grant, actor_id: "member" },
    { ...grant, actor_id: "guest:demo", owner_id: "guest:demo" },
  ]) {
    const f = fixture();
    await assert.rejects(f.inspectGithubAccess(actor));
    assert.equal(f.calls.length, 0);
  }
  for (const options of [{ noAccess: true }, { changedRepo: true }]) {
    const f = fixture(options);
    await assert.rejects(f.inspectGithubAccess(grant));
    assert.equal(f.calls.length, 0);
  }
  const f = fixture(),
    tools = load("lib/run-agent-tools.ts", f.deps);
  assert.ok(
    tools.runAgentTools(grant).some((x) => x.name === "inspect_github_access"),
  );
  for (const actor of [
    { ...grant, actor_id: "member" },
    { ...grant, actor_id: "guest:demo", owner_id: "guest:demo" },
  ])
    assert.ok(
      !tools
        .runAgentTools(actor)
        .some((x) => x.name === "inspect_github_access"),
    );
  await assert.rejects(
    tools.callRunAgentTool(grant, "inspect_github_access", {
      repo: "owner/other",
    }),
    /scope cannot be overridden/,
  );
});
