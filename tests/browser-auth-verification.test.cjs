const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load-module.cjs");
test("authentication failures identify the observed condition without exposing cookies, URLs or private markers", async () => {
  const { authenticatedPage } = load("lib/browser-auth.ts", {});
  for (const [options, expected] of [
    [{ status: 401 }, /HTTP 401/],
    [
      { url: "https://provider.example/login?secret=private" },
      /different origin/,
    ],
    [{ url: "https://app.example/login" }, /sign-in page/],
    [{ password: true }, /password form/],
    [{ marker: true }, /signed-in text was not found/],
  ]) {
    let closed = 0;
    const page = {
      goto: async () => ({ status: () => options.status || 200 }),
      url: () => options.url || "https://app.example/dashboard",
      locator: () => ({
        first: () => ({ isVisible: async () => !!options.password }),
      }),
      getByText: () => ({
        first: () => ({
          waitFor: async () => {
            throw Error("private-marker");
          },
        }),
      }),
    };
    const browser = {
      newContext: async () => ({
        newPage: async () => page,
        close: async () => {
          closed++;
        },
      }),
    };
    const profile = {
      origin: "https://app.example",
      verification_path: "/dashboard",
      verification_text: options.marker ? "private-marker" : null,
      state: { cookies: [], origins: [], headers: {} },
    };
    await assert.rejects(
      authenticatedPage(browser, profile),
      (error) =>
        expected.test(error.message) && !error.message.includes("private"),
    );
    assert.equal(closed, 1);
  }
});
