const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { load } = require("./load-module.cjs");
const icons = load("lib/site-icons.ts", {
  "@/lib/site": { SITE_URL: "https://www.trypreflight.dev" },
});
test("PreFlight uses its actual icon for apex and www domains, with no lookalike matches", () => {
  assert.equal(icons.isPreflightOrigin("https://trypreflight.dev"), true);
  assert.equal(icons.isPreflightOrigin("https://www.trypreflight.dev"), true);
  assert.equal(
    icons.isPreflightOrigin("https://trypreflight.dev.evil.test"),
    false,
  );
  for (const url of [
    null,
    "bad",
    "javascript:alert(1)",
    "https://user:secret@example.com",
  ])
    assert.equal(icons.appIconOrigin(url), null);
});
test("declared favicons resolve base paths, entity encoding, shortcuts, SVG and touch icons", () => {
  const result = icons.declaredSiteIcons(
    `<base href="/assets/"><link href='touch.png' rel='apple-touch-icon'><link sizes="32x32" rel="shortcut ICON" href="small.png"><LINK href="/icon.svg?v=1&amp;x=2" type="image/svg+xml" rel="icon"><link rel=icon href=large.png sizes=128x128>`,
    "https://app.test/start",
  );
  assert.deepEqual(result, [
    "https://app.test/icon.svg?v=1&x=2",
    "https://app.test/assets/large.png",
    "https://app.test/assets/small.png",
    "https://app.test/assets/touch.png",
  ]);
});
test("favicon parsing ignores scripts, comments, unsupported URLs and duplicate declarations", () => {
  assert.deepEqual(
    icons.declaredSiteIcons(
      `<!-- <link rel="icon" href="/comment.png"> --><script>const x='<link rel="icon" href="/fake.png">';</script><link rel="icon" href="javascript:alert(1)"><link rel="icon" href="data:image/png,x"><link rel="icon" href="/real.png"><link rel="icon" href="/real.png">`,
      "https://app.test",
    ),
    ["https://app.test/real.png"],
  );
});
function discoveryFixture(address = "93.184.216.34", responses = {}) {
  const calls = [];
  const request = (url, options, callback) => {
    const req = new EventEmitter();
    req.end = () =>
      queueMicrotask(() => {
        calls.push({ url: url.href, options });
        const r = new EventEmitter();
        const definition = responses[url.href] || {
          body: '<link rel="icon" href="/brand.png">',
        };
        r.statusCode = definition.status || 200;
        r.headers = definition.headers || { "content-type": "text/html" };
        r.destroy = () => {};
        callback(r);
        if (r.statusCode === 200) {
          r.emit("data", Buffer.from(definition.body || ""));
          r.emit("end");
        }
      });
    return req;
  };
  const module = load("lib/discover-site-icons.ts", {
    "node:dns/promises": { lookup: async () => [{ address, family: 4 }] },
    "node:http": { request },
    "node:https": { request },
    "@/lib/postgres-verification": {
      publicDatabaseAddress: (value) => value === "93.184.216.34",
    },
    "@/lib/site-icons": icons,
  });
  return { ...module, calls };
}
test("favicon discovery pins the public destination and follows redirects using the final page base", async () => {
  const fixture = discoveryFixture(undefined, {
    "https://app.test/": {
      status: 302,
      headers: { location: "https://www.app.test/home" },
    },
    "https://www.app.test/home": {
      body: '<link rel="icon" href="icons/brand.png">',
    },
  });
  assert.deepEqual(await fixture.discoverSiteIcons("https://app.test"), [
    "https://www.app.test/icons/brand.png",
    "https://www.app.test/favicon.ico",
  ]);
  assert.equal(fixture.calls.length, 2);
  for (const call of fixture.calls) {
    assert.equal(call.options.family, 4);
    assert.equal(call.options.agent, false);
    assert.ok(!("Cookie" in call.options.headers));
    let ip;
    call.options.lookup("app.test", {}, (_error, value) => (ip = value));
    assert.equal(ip, "93.184.216.34");
  }
});
test("favicon discovery refuses private networks, credentials, non-web schemes and unsafe redirect ports", async () => {
  const privateSite = discoveryFixture("127.0.0.1");
  assert.deepEqual(await privateSite.discoverSiteIcons("https://app.test"), []);
  assert.equal(privateSite.calls.length, 0);
  for (const location of [
    "http://app.test:3000/",
    "file:///etc/passwd",
    "https://user:password@app.test/",
  ]) {
    const fixture = discoveryFixture(undefined, {
      "https://app.test/": { status: 302, headers: { location } },
    });
    assert.deepEqual(await fixture.discoverSiteIcons("https://app.test"), []);
    assert.equal(fixture.calls.length, 1);
  }
});
test("favicon discovery caps redirect chains and HTML response size", async () => {
  const loop = discoveryFixture(undefined, {
    "https://app.test/": { status: 302, headers: { location: "/" } },
  });
  assert.deepEqual(await loop.discoverSiteIcons("https://app.test"), []);
  assert.equal(loop.calls.length, 4);
  const big = discoveryFixture(undefined, {
    "https://app.test/": {
      body: " ".repeat(128001) + '<link rel="icon" href="/beyond-limit.png">',
    },
  });
  assert.deepEqual(await big.discoverSiteIcons("https://app.test"), [
    "https://app.test/favicon.ico",
  ]);
});
test("project logo immediately renders the bundled PreFlight icon without Google", () => {
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");
  const Logo = load("components/ProjectLogo.tsx", {
    "@/lib/site-icons": icons,
  }).default;
  for (const appUrl of [
    "https://trypreflight.dev/",
    "https://www.trypreflight.dev/",
  ]) {
    const html = renderToStaticMarkup(
      React.createElement(Logo, {
        appUrl,
        name: "James-Software/Preflight",
        projectId: 1,
      }),
    );
    assert.match(html, /src="\/icon.png"/);
    assert.ok(!html.includes("google.com"));
  }
});
test("favicon API checks project ownership before network access and bypasses discovery for PreFlight", async () => {
  let owner = null,
    project = null,
    contacts = 0;
  const route = load("app/api/projects/[id]/favicon/route.ts", {
    "@/auth": {
      auth: async () => (owner ? { user: { githubId: owner } } : null),
    },
    "@/lib/schema": { getProject: async () => project },
    "@/lib/site-icons": icons,
    "@/lib/discover-site-icons": {
      discoverSiteIcons: async () => {
        contacts++;
        return [];
      },
    },
  });
  const context = { params: Promise.resolve({ id: "1" }) };
  assert.equal(
    (await route.GET(new Request("https://preflight.test"), context)).status,
    401,
  );
  owner = "100";
  assert.equal(
    (await route.GET(new Request("https://preflight.test"), context)).status,
    404,
  );
  assert.equal(contacts, 0);
  project = { app_url: "https://trypreflight.dev/" };
  const result = await route.GET(
    new Request("https://preflight.test"),
    context,
  );
  assert.deepEqual(await result.json(), { icons: ["/icon.png"] });
  assert.equal(contacts, 0);
});
