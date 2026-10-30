const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const { load } = require("./load-module.cjs");
const postgres = load("lib/postgres-verification.ts", { "@/lib/database-check-config": load("lib/database-check-config.ts", {}) });

function fixture({ addresses = [{ address: "93.184.216.34", family: 4 }], responses = [{ status: 200, headers: {}, body: "hello" }] } = {}) {
  const connections = [];
  const request = (url, options, callback) => {
    connections.push({ url: url.href, options });
    const req = new EventEmitter();
    req.end = () => queueMicrotask(() => {
      options.lookup(url.hostname, {}, (error, address) => {
        assert.equal(error, null); assert.equal(address, addresses.find(a => a.family === 4)?.address || addresses[0].address);
      });
      const next = responses.shift();
      const res = new PassThrough();
      res.statusCode = next.status; res.headers = next.headers;
      callback(res); res.end(next.body);
    });
    return req;
  };
  const api = load("lib/public-http.ts", {
    "node:dns/promises": { lookup: async () => addresses },
    "node:http": { request }, "node:https": { request },
    "@/lib/postgres-verification": postgres,
  });
  return { api, connections };
}

test("targets reject local/private addresses, credentials, unusual ports and non-web protocols", async () => {
  const { api, connections } = fixture();
  for (const url of ["http://127.0.0.1", "http://2130706433", "http://[::1]", "http://169.254.169.254", "http://10.1.2.3", "http://service.internal", "https://a.localhost", "http://public.example:5432", "https://user:secret@public.example", "file:///etc/passwd", "javascript:alert(1)"])
    assert.throws(() => api.publicHttpUrl(url), api.TargetAccessError, url);
  assert.equal(connections.length, 0);
  for (const addresses of [[{ address: "10.0.0.1", family: 4 }], [{ address: "93.184.216.34", family: 4 }, { address: "fd00::1", family: 6 }]]) {
    const f = fixture({ addresses });
    await assert.rejects(f.api.publicHttpRequest("https://public.example"), /Private/);
    assert.equal(f.connections.length, 0);
  }
});

test("public requests pin the validated address and preserve the original TLS/Host destination", async () => {
  const { api, connections } = fixture();
  const result = await api.publicHttpRequest("https://public.example/path", { headers: { host: "evil.example", "proxy-authorization": "must-not-forward", Cookie: "scoped-session" } });
  assert.equal(result.body.toString(), "hello");
  assert.equal(connections[0].url, "https://public.example/path");
  assert.equal(connections[0].options.headers.host, undefined);
  assert.equal(connections[0].options.headers["proxy-authorization"], undefined);
  assert.equal(connections[0].options.headers.Cookie, "scoped-session");
  assert.notEqual(connections[0].options.rejectUnauthorized, false);
});

test("HTML redirects are bounded and cannot redirect into a private or another origin", async () => {
  for (const location of ["http://127.0.0.1/internal", "https://other.example/path"]) {
    const f = fixture({ responses: [{ status: 302, headers: { location }, body: "" }] });
    await assert.rejects(f.api.publicHtml("https://public.example"), f.api.TargetAccessError);
    assert.equal(f.connections.length, 1);
  }
  const f = fixture({ responses: [{ status: 302, headers: { location: "/page" }, body: "" }, { status: 200, headers: {}, body: "<html>ok</html>" }] });
  assert.equal((await f.api.publicHtml("https://public.example")).html, "<html>ok</html>");
  assert.equal(f.connections[1].url, "https://public.example/page");
  const loop = fixture({ responses: Array.from({ length: 4 }, () => ({ status: 302, headers: { location: "/loop" }, body: "" })) });
  await assert.rejects(loop.api.publicHtml("https://public.example"), /redirect limit/);
  assert.equal(loop.connections.length, 4);
});

test("response and request budgets are enforced before unbounded buffering", async () => {
  const f = fixture();
  await assert.rejects(f.api.publicHttpRequest("https://public.example", { body: Buffer.alloc(1_048_577) }), /1 MB/);
  assert.equal(f.connections.length, 0);
  await assert.rejects(f.api.publicHttpRequest("https://public.example", { maxBytes: 4 }), /size limit/);
  const compressed = require("node:zlib").gzipSync(Buffer.alloc(65536));
  assert.throws(() => f.api.decodedPublicBody({ body: compressed, headers: { "content-encoding": "gzip" } }, 1024), /compressed/);
});
