const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load-module.cjs");
const sharp = require("sharp");
const settings = load("lib/project-settings.ts", { sharp: { default: sharp } });
test("project general settings validate names, app URLs and repository selections", () => {
  assert.deepEqual(
    settings.parseProjectSettings({
      displayName: " Storefront ",
      appUrl: "",
      repo: "owner/app",
      imageMode: "auto",
    }),
    {
      displayName: "Storefront",
      appUrl: null,
      repo: "owner/app",
      imageMode: "auto",
    },
  );
  for (const patch of [
    { displayName: "x".repeat(81) },
    { appUrl: "javascript:alert(1)" },
    { appUrl: "https://user:secret@app.test" },
    { repo: "https://github.com/owner/app" },
    { imageMode: "url" },
  ])
    assert.throws(() =>
      settings.parseProjectSettings({
        displayName: "App",
        appUrl: "https://app.test",
        repo: "owner/app",
        imageMode: "keep",
        ...patch,
      }),
    );
});
test("uploaded project images are decoded, bounded and re-encoded as safe thumbnails", async () => {
  const original = await sharp({
    create: {
      width: 800,
      height: 500,
      channels: 4,
      background: { r: 70, g: 80, b: 230, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  const data = await settings.projectImage(
    new File([original], "logo.png", { type: "image/png" }),
  );
  assert.ok(data.startsWith("data:image/webp;base64,"));
  const metadata = await sharp(
    Buffer.from(data.split(",")[1], "base64"),
  ).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 256);
  assert.ok(metadata.height <= 256);
  await assert.rejects(
    settings.projectImage(
      new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], "logo.svg", {
        type: "image/svg+xml",
      }),
    ),
    /static PNG/,
  );
  await assert.rejects(
    settings.projectImage(
      new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large.png"),
    ),
    /2 MB/,
  );
});
function routeFixture(options = {}) {
  let writes = [],
    verified = [];
  const route = load("app/api/projects/[id]/route.ts", {
    "@/auth": {
      auth: async () =>
        options.signedOut ? null : { user: { githubId: "100" } },
    },
    "@/lib/schema": {
      getProject: async () =>
        options.foreign
          ? null
          : { id: 1, repo_full_name: "owner/app", image_url: "original-image" },
      updateProjectSettings: async (...args) => {
        writes.push(args);
        return true;
      },
    },
    "@/lib/project-settings": settings,
    "@/lib/github": {
      GithubAuthError: class extends Error {},
      getGithubContext: async () => ({ login: "owner", ownerGithubId: "100" }),
      verifyRepo: async (...args) => {
        verified.push(args);
        return options.denied
          ? { ok: false, error: "You can only connect repositories you own." }
          : { ok: true, fullName: "owner/new-app" };
      },
    },
    "next/cache": { revalidatePath: () => {} },
  });
  const { NextRequest } = require("next/server");
  return {
    writes,
    verified,
    patch: async (values = {}, origin = "https://preflight.test") => {
      const body = new FormData();
      for (const [k, v] of Object.entries({
        displayName: "Storefront",
        appUrl: "https://app.test",
        repo: "owner/app",
        imageMode: "keep",
        ...values,
      }))
        body.set(k, v);
      return route.PATCH(
        new NextRequest("https://preflight.test/api/projects/1", {
          method: "PATCH",
          headers: { origin },
          body,
        }),
        { params: Promise.resolve({ id: "1" }) },
      );
    },
  };
}
test("general settings reject foreign origins and projects before mutation", async () => {
  for (const [options, origin, status] of [
    [{}, "https://evil.test", 403],
    [{ signedOut: true }, undefined, 401],
    [{ foreign: true }, undefined, 404],
  ]) {
    const f = routeFixture(options);
    assert.equal((await f.patch({}, origin)).status, status);
    assert.equal(f.writes.length, 0);
    assert.equal(f.verified.length, 0);
  }
});
test("identity and URL edits preserve the image and do not require GitHub reauthorization", async () => {
  const f = routeFixture();
  assert.equal((await f.patch()).status, 200);
  assert.equal(f.verified.length, 0);
  assert.equal(f.writes[0][1], "100");
  assert.equal(f.writes[0][2].imageUrl, "original-image");
  assert.equal(f.writes[0][2].displayName, "Storefront");
  assert.equal((await f.patch({ imageMode: "auto" })).status, 200);
  assert.equal(f.writes[1][2].imageUrl, null);
});
test("repository changes are reverified before saving and denied repos never mutate settings", async () => {
  const denied = routeFixture({ denied: true });
  assert.equal((await denied.patch({ repo: "other/app" })).status, 400);
  assert.equal(denied.writes.length, 0);
  const allowed = routeFixture();
  assert.equal((await allowed.patch({ repo: "owner/new-app" })).status, 200);
  assert.equal(allowed.verified.length, 1);
  assert.equal(allowed.writes[0][2].repoFullName, "owner/new-app");
});
test("the project sidebar puts Runs first, selects it for reports and includes settings icons and a back link", () => {
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");
  const Sidebar = load("components/ProjectSidebar.tsx", {
    "next/link": {
      default: ({ children, prefetch, ...props }) =>
        React.createElement("a", props, children),
    },
    "next/navigation": { usePathname: () => "/dashboard/projects/1/runs/2" },
    "@/components/ProjectLogo": { default: () => null },
  }).default;
  const html = renderToStaticMarkup(
    React.createElement(Sidebar, {
      project: {
        id: 1,
        name: "Storefront",
        repo: "owner/app",
        appUrl: "https://app.test",
      },
    }),
  );
  assert.ok(html.indexOf(">Runs</a>") < html.indexOf("General info"));
  assert.ok(html.includes("Back to projects"));
  assert.match(html, /href="\/dashboard\/projects\/1"[^>]*aria-current="page"/);
  assert.ok(html.includes("/database"));
  assert.equal((html.match(/<svg/g) || []).length, 4);
});

test("project sections preserve their own login destination and reject foreign projects", async () => {
  let owner = null,
    reads = 0;
  const page = load("lib/project-page.ts", {
    "@/auth": {
      auth: async () => (owner ? { user: { githubId: owner } } : null),
    },
    "@/lib/schema": {
      getProject: async () => {
        reads++;
        return null;
      },
    },
    "next/navigation": {
      redirect: (url) => {
        throw Object.assign(new Error("redirect"), { url });
      },
      notFound: () => {
        throw new Error("not-found");
      },
    },
  });
  await assert.rejects(
    page.projectPage("1", "/general"),
    (e) => e.url === "/login?callbackUrl=%2Fdashboard%2Fprojects%2F1%2Fgeneral",
  );
  assert.equal(reads, 0);
  owner = "100";
  await assert.rejects(page.projectPage("bad", "/database"), /not-found/);
  assert.equal(reads, 0);
  await assert.rejects(page.projectPage("1", "/database"), /not-found/);
  assert.equal(reads, 1);
});
