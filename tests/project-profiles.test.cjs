const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load-module.cjs");
const state = load("lib/auth-profile-state.ts", {});
test("profile reads, creation, deletion and run selection are bound to the project even for the same app origin", async (t) => {
  const old = process.env.PROFILE_ENCRYPTION_KEY;
  process.env.PROFILE_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
  t.after(() => {
    if (old === undefined) delete process.env.PROFILE_ENCRYPTION_KEY;
    else process.env.PROFILE_ENCRYPTION_KEY = old;
  });
  const calls = [];
  const encrypted = state.encryptProfile(
    { cookies: [], origins: [], headers: { Authorization: "private-token" } },
    "100",
    "https://app.example.com",
  );
  const row = {
    id: 3,
    name: "Account A",
    origin: "https://app.example.com",
    encrypted_state: encrypted,
    verification_path: "/dashboard",
    verification_text: "Workspace",
  };
  const profiles = load("lib/auth-profiles.ts", {
    "@/lib/auth-profile-state": state,
    "@/lib/schema": {
      ensureSchema: async () => {},
      getProject: async (id, owner) =>
        owner === "100" && [12, 13].includes(id) ? { id } : null,
    },
    "@/lib/db": {
      getSql:
        () =>
        async (parts, ...values) => {
          const q = parts.join("?");
          calls.push({ q, values });
          if (q.includes("INSERT INTO auth_profiles")) return [row];
          assert.match(q, /project_id\s*=\s*\?/);
          return values.includes(12) ? [row] : [];
        },
    },
  });
  assert.equal((await profiles.listAuthProfiles("100", 12)).length, 1);
  assert.equal((await profiles.listAuthProfiles("100", 13)).length, 0);
  assert.equal(
    (await profiles.profileForRun("100", 3, "https://app.example.com", 12)).id,
    3,
  );
  await assert.rejects(
    profiles.profileForRun("100", 3, "https://app.example.com", 13),
    /unavailable/,
  );
  assert.equal(await profiles.revokeAuthProfile("100", 3, 13), false);
  await profiles.createAuthProfile(
    "100",
    {
      name: "Account A",
      origin: "https://app.example.com",
      session: "[]",
      headers: '{"Authorization":"test-token"}',
    },
    12,
  );
  assert.ok(calls.at(-1).values.includes(12));
  assert.match(calls.at(-1).q, /verification_text, project_id/);
  const before = calls.length;
  await assert.rejects(profiles.listAuthProfiles("other", 12), /unavailable/);
  assert.equal(calls.length, before);
});
test("profile APIs require an owned project before delegating any profile operation", async () => {
  const { NextRequest } = require("next/server");
  let writes = 0,
    scope;
  const profiles = {
    profileProject: async (_owner, p) => {
      if (p !== 12) throw new state.ProfileError("Project unavailable.");
    },
    listAuthProfiles: async (_owner, p) => {
      if (p !== 12) throw new state.ProfileError("Project unavailable.");
      scope = p;
      return [];
    },
    createAuthProfile: async (_o, _body, p) => {
      writes++;
      scope = p;
      return { id: 3 };
    },
    revokeAuthProfile: async (_o, _id, p) => {
      writes++;
      scope = p;
      return true;
    },
    assignAuthProfile: async (_o, p) => {
      writes++;
      scope = p;
      return { id: 3 };
    },
  };
  const route = load("app/api/profiles/route.ts", {
    "@/auth": { auth: async () => ({ user: { githubId: "100" } }) },
    "next/cache": { revalidatePath: () => {} },
    "@/lib/auth-profile-state": state,
    "@/lib/auth-profiles": profiles,
  });
  const req = (method, id, body = {}) =>
    new NextRequest(`https://app.test/api/profiles?projectId=${id}`, {
      method,
      headers: { Origin: "https://app.test" },
      ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
    });
  assert.equal((await route.GET(req("GET", 13))).status, 404);
  const valid = {
    name: "A",
    origin: "https://app.example.com",
    session: "[]",
    headers: "{}",
  };
  assert.equal((await route.POST(req("POST", 13, valid))).status, 400);
  assert.equal((await route.DELETE(req("DELETE", 13, { id: 3 }))).status, 400);
  assert.equal(writes, 0);
  assert.equal((await route.POST(req("POST", 12, valid))).status, 201);
  assert.equal(scope, 12);
  assert.equal(
    (await route.POST(req("POST", 12, { action: "assign", id: 3 }))).status,
    200,
  );
  assert.equal(writes, 2);
});
test("sign-in capture grants include the project in start, restore, save and cancel queries", async () => {
  const calls = [];
  let connects = 0;
  const capture = load("lib/profile-capture.ts", {
    "@/lib/auth-profiles": {
      profileProject: async (_owner, p) => {
        if (![12, 13].includes(p))
          throw new state.ProfileError("Project unavailable.");
      },
    },
    "@/lib/schema": { ensureSchema: async () => {} },
    "@/lib/auth-profile-state": state,
    "@/lib/browser-auth": {},
    "@/lib/browserbase": {
      browserLiveUrl: async () => {
        connects++;
        return "https://browser.test/live";
      },
    },
    "playwright-core": {},
    "@/lib/db": {
      getSql:
        () =>
        async (parts, ...values) => {
          const q = parts.join("?");
          calls.push({ q, values });
          return [];
        },
    },
  });
  assert.equal(await capture.activeProfileCapture("100", 13), null);
  assert.match(calls[0].q, /project_id=\?/);
  assert.ok(calls[0].values.includes(13));
  await assert.rejects(
    capture.finishProfileCapture(
      "100",
      "12345678-1234-1234-1234-123456789abc",
      13,
    ),
    /unavailable/,
  );
  assert.match(calls.at(-1).q, /project_id=\?/);
  assert.equal(connects, 0);
});
test("Database contains cleanup and rejects a run outside the project", async () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const Sidebar = load("components/ProjectSidebar.tsx", {
    "next/link": {
      default: ({ children, ...props }) =>
        React.createElement("a", props, children),
    },
    "next/navigation": { usePathname: () => "/dashboard/projects/12/database" },
    "@/components/ProjectLogo": { default: () => null },
  }).default;
  const html = renderToStaticMarkup(
    React.createElement(Sidebar, {
      project: { id: 12, name: "App", repo: "owner/app", appUrl: null },
    }),
  );
  assert.match(
    html,
    /href="\/dashboard\/projects\/12\/database"[^>]*aria-current="page"/,
  );
  assert.ok(html.indexOf(">Runs</a>") < html.indexOf(">Profiles</a>"));
  const page = load("app/dashboard/projects/[id]/database/page.tsx", {
    "next/link": {},
    "next/navigation": {
      notFound: () => {
        throw new Error("not-found");
      },
    },
    "@/lib/project-page": {
      projectPage: async () => ({ project: { id: 12, owner_github_id: "100" }, owner: "100" }),
    },
    "@/lib/database-cleanup": {
      listProjectCleanupRuns: async () => [
        { id: 5, status: "done", pending_count: 1 },
      ],
    },
    "@/lib/database-connections": { listProjectDatabases: async () => [] },
    "@/components/DatabaseSettings": {},
    "@/components/DatabaseCleanup": {},
    "@/components/CleanupRunPicker": {},
  }).default;
  await assert.rejects(
    page({
      params: Promise.resolve({ id: "12" }),
      searchParams: Promise.resolve({ run: "99" }),
    }),
    /not-found/,
  );
});
