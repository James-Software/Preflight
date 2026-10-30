const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { load } = require("./load-module.cjs");

test("project invite callbacks accept only a single invitation path on the real app origin", () => {
  const { safeReturnTo } = load("lib/return-to.ts", { "./site": { SITE_URL: "https://www.trypreflight.dev" } });
  const path = "/project-invite/" + "A".repeat(43);
  assert.equal(safeReturnTo(path), path);
  for (const value of ["https://evil.test" + path, path + "/settings", "/project-invite/short", "/project-invite/../api/profiles", "/api/project-invites/token"])
    assert.equal(safeReturnTo(value), "/dashboard");
});

test("repository grants recheck membership on every request and reject scope escape before accessing GitHub", async () => {
  let active = true, reads = 0;
  const api = load("lib/project-repository-access.ts", { "@/lib/db": { getSql: () => async (_parts, ...values) => {
    reads++; assert.deepEqual(values, [1, "owner", "owner/app", "member", true]); return active ? [{ id: 1 }] : [];
  } } });
  const grant = { projectId: 1, actor: "member", owner: "owner", repo: "owner/app" };
  await api.assertProjectRepositoryAccess(grant, new URL("https://api.github.com/repos/owner/app/branches/feature%2Fwork"));
  active = false;
  await assert.rejects(api.assertProjectRepositoryAccess(grant, new URL("https://api.github.com/repos/owner/app")), /access.*ended/);
  for (const path of ["/user/repos", "/repos/owner/app2", "/repos/owner/app/%2e%2e%2fsecret"])
    await assert.rejects(api.assertProjectRepositoryAccess(grant, new URL("https://api.github.com" + path)), /outside/);
  assert.equal(reads, 2);
});

test("email errors are honest and never expose the Resend key or provider response", async (t) => {
  const previous = { key: process.env.RESEND_API_KEY, from: process.env.INVITE_FROM_EMAIL };
  t.after(() => {
    for (const [name, value] of [["RESEND_API_KEY", previous.key], ["INVITE_FROM_EMAIL", previous.from]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
  const mail = load("lib/project-mail.ts", { "@/lib/site": { SITE_URL: "https://www.trypreflight.dev" } });
  delete process.env.RESEND_API_KEY; delete process.env.INVITE_FROM_EMAIL;
  assert.throws(mail.assertInviteMailConfigured, /RESEND_API_KEY and INVITE_FROM_EMAIL/);
  process.env.RESEND_API_KEY = "private-resend-key"; process.env.INVITE_FROM_EMAIL = "invites@example.test";
  let status = 403;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(init.headers.Authorization, "Bearer private-resend-key");
    assert.equal(init.headers["Idempotency-Key"], "one-invitation");
    return new Response("private-provider-details", { status });
  });
  await assert.rejects(mail.sendProjectMail("teammate@example.test", "Join", "Invitation", "one-invitation"), (error) => /rejected/.test(error.message) && !/private/.test(error.message));
  status = 429;
  await assert.rejects(mail.sendProjectMail("teammate@example.test", "Join", "Invitation", "one-invitation"), /sending limit/);
});

test("collaboration UI gives owners invite controls and members a simple people list", () => {
  const Component = load("components/ProjectCollaborators.tsx", {}).default;
  const props = { projectId: 1, ownerLogin: "owner", initial: { owner: true, members: [{ user_id: "2", github_login: "bob", email: "bob@example.test", joined_at: "" }], invitations: [{ id: "invite", email: "pending@example.test", delivery: "sent", status: "pending", expires_at: "" }] } };
  const ownerHtml = renderToStaticMarkup(React.createElement(Component, props));
  assert.match(ownerHtml, /Invite by email/);
  assert.match(ownerHtml, /type="email"/);
  assert.match(ownerHtml, /method="post"/);
  assert.match(ownerHtml, /Send invitation/);
  assert.match(ownerHtml, /Revoke/);
  const memberHtml = renderToStaticMarkup(React.createElement(Component, { ...props, initial: { ...props.initial, owner: false, invitations: [] } }));
  assert.match(memberHtml, /@bob/);
  assert.doesNotMatch(memberHtml, /Send invitation|Revoke|Remove|pending@example/);
});

test("shared project navigation keeps credential settings with the owner", () => {
  const Component = load("components/ProjectSidebar.tsx", {
    "next/link": { default: ({ children, prefetch, ...props }) => React.createElement("a", props, children) },
    "next/navigation": { usePathname: () => "/dashboard/projects/1/collaboration" },
    "@/components/ProjectLogo": { default: () => null },
  }).default;
  const html = renderToStaticMarkup(React.createElement(Component, { canManage: false, project: { id: 1, name: "Shared app", repo: "owner/app", appUrl: null } }));
  assert.match(html, /Collaboration/); assert.match(html, />Runs</);
  assert.doesNotMatch(html, /General info|>Database<|>Profiles</);
});
