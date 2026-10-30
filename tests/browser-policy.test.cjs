const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load-module.cjs");
const policy = load("lib/browser-policy.ts", {});
const origin = "https://app.example";
const marker = "preflight-1-0-0-abcdef";

test("every run rejects outside navigation and destructive/payment/account actions", () => {
  for (const name of ["Delete project", "Update permissions", "Pay now", "Send invite", "Sign up", "Reset password", "Disconnect database", "Publish", "Edit customer"])
    assert.equal(policy.allowedBrowserAction({ action: "click", role: "button", name }, origin, true), false, name);
  for (const value of ["https://other.example", "https://app.example/delete", "https://app.example/%64elete", "https://app.example/?action=delete", "https://app.example/security"])
    assert.equal(policy.allowedBrowserAction({ action: "goto", value }, origin), false, value);
  assert.equal(policy.allowedBrowserAction({ action: "click", role: "button", name: "Join the waitlist" }, origin, true), true);
  assert.equal(policy.allowedBrowserAction({ action: "press", key: "Enter", name: "Email" }, origin, false), false);
});

test("writes require an authorized same-origin POST containing the unique marker", () => {
  const input = { url: origin + "/api/waitlist", method: "POST", navigation: false, body: JSON.stringify({ email: marker + "@example.test" }) };
  assert.equal(policy.browserRequestAllowed(input, origin), false);
  assert.equal(policy.browserRequestAllowed(input, origin, marker), true);
  for (const patch of [
    { url: "https://other.example/save" }, { url: origin + "/api/delete" },
    { method: "DELETE" }, { method: "PUT" }, { method: "PATCH" },
    { body: '{"email":"unrelated@example.test"}' },
    { body: JSON.stringify({ marker, action: "delete" }) },
  ]) assert.equal(policy.browserRequestAllowed({ ...input, ...patch }, origin, marker), false, JSON.stringify(patch));
  assert.equal(policy.browserRequestAllowed({ url: "http://127.0.0.1/private", method: "GET", navigation: false, body: "" }, origin), false);
});

test("browser contexts pin requests, block service writes and websockets, and abort work when closed", async () => {
  let handler, socketHandler, active = true, requested = 0, aborted = 0, fulfilled = 0;
  const api = load("lib/browser-policy.ts", { "@/lib/public-http": {
    decodedPublicBody: response => response.body,
    publicHttpUrl: raw => { const url = new URL(raw); if (url.hostname === "127.0.0.1") throw new Error(); return url; },
    publicHttpRequest: async (_url, options) => { requested++; assert.equal(options.headers.Authorization, "Bearer scoped"); return { status: 200, headers: {}, body: Buffer.from("ok") }; },
  } });
  const p = api.browserPolicy({ origin, assertActive: async () => { if (!active) throw new Error("cancelled"); }, headers: { Authorization: "Bearer scoped" } });
  await p.prepare({ route: async (_pattern, h) => { handler = h; }, routeWebSocket: async (_pattern, h) => { socketHandler = h; }, close: async () => {} });
  const route = method => ({ request: () => ({ url: () => origin + "/api/waitlist", method: () => method, isNavigationRequest: () => false, postData: () => JSON.stringify({ email: marker + "@example.test" }), postDataBuffer: () => Buffer.from(JSON.stringify({ email: marker + "@example.test" })), allHeaders: async () => ({}) }), abort: async () => { aborted++; }, fulfill: async () => { fulfilled++; } });
  await handler(route("POST")); assert.equal(requested, 0);
  p.reset(); p.permitCreate(marker, { action: "click", name: "Join the waitlist" });
  await handler(route("POST")); assert.equal(fulfilled, 1);
  let closedSocket = false; socketHandler({ close: () => { closedSocket = true; } }); assert.equal(closedSocket, true);
  active = false; await handler(route("GET")); assert.equal(requested, 1); assert.equal(aborted, 2);
  await p.close();
});
