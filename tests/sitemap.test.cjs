const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load-module.cjs");
const SITE_URL = "https://www.trypreflight.dev";
function sitemap(listPublishedPosts) {
  return load("app/sitemap.ts", {
    "@/lib/site": { SITE_URL },
    "@/lib/blog": { listPublishedPosts },
  }).default;
}
test("sitemap lists canonical public pages and current published posts", async () => {
  const entries = await sitemap(async () => [
    { slug: "testing-real-apps", updated_at: "2026-10-28T12:00:00Z" },
  ])();
  assert.deepEqual(entries.map(entry => entry.url), [
    `${SITE_URL}/`, `${SITE_URL}/blog`, `${SITE_URL}/blog/testing-real-apps`,
    `${SITE_URL}/privacy`, `${SITE_URL}/terms`,
    ...["", "/briefing", "/architecture", "/economics", "/development", "/verification"].map(path=>`${SITE_URL}/submission${path}`),
  ]);
  assert.equal(entries[2].lastModified.toISOString(), "2026-10-28T12:00:00.000Z");
});
test("an empty published blog still includes all public static pages", async () => {
  const entries = await sitemap(async () => [])();
  assert.equal(entries.length, 10);
  assert.ok(entries.every(entry => !/dashboard|invite|login|api|markdown/.test(new URL(entry.url).pathname)));
});
test("blog failures surface for retry rather than dropping published URLs", async () => {
  await assert.rejects(sitemap(async () => { throw new Error("Blog unavailable"); })(), /Blog unavailable/);
});
