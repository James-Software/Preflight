const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { load } = require("./load-module.cjs");
const api = load("lib/run-details.ts", {});
test("partial reports preserve results without reclassifying genuine setup failures as success", () => {
  assert.equal(api.displayRunStatus("failed", true), "partial");
  assert.equal(api.displayRunStatus("failed", false), "failed");
  assert.equal(api.displayRunStatus("cancelled", true), "cancelled");
  assert.equal(api.runStatusLabel("partial"), "Partially completed");
  const report = {
    run: {
      id: 19,
      status: "failed",
      auth_profile_snapshot: { encrypted_state: "private-session" },
      target_url: "https://private.test/?key=private-key",
    },
    findings: [
      {
        id: 2,
        title: "Observed failure",
        status: "open",
        patch_diff: "private-patch",
      },
    ],
    testResults: [
      {
        title: "One check",
        status: "needs_review",
        summary: "Not confirmed",
        evidence: "private-evidence",
      },
    ],
  };
  const details = api.runDetails(report);
  assert.equal(details.status, "partial");
  assert.equal(details.storedStatus, "failed");
  assert.equal(details.checks[0].status, "inconclusive");
  assert.ok(!JSON.stringify(details).includes("private-"));
  assert.match(
    api.safeRunFailure(new Error("OpenAI Decisions API error 403 private-key")),
    /HTTP 403/,
  );
  assert.ok(
    !api
      .safeRunFailure(new Error("OpenAI private-key"))
      .includes("private-key"),
  );
});
test("unconfirmed and legacy review observations have no mandatory review queue", () => {
  const Results = load("components/TestStepResults.tsx", {}).default;
  const html = renderToStaticMarkup(
    React.createElement(Results, {
      results: [
        {
          step_id: "one",
          title: "One check",
          status: "needs_review",
          summary: "Not confirmed",
        },
        {
          step_id: "two",
          title: "Another check",
          status: "inconclusive",
          summary: "Not confirmed",
        },
      ],
    }),
  );
  assert.doesNotMatch(html, /needs review|need review|approve/i);
  assert.match(html, /2.*awaiting verification/);
  assert.match(html, /<details/);
  assert.doesNotMatch(html, /<details open/);
});
test("reports keep visibility-aware automatic refresh without rendering a refresh button", (t) => {
  let refreshes = 0,
    timer,
    cleared = 0;
  const cleanup = [];
  const previous = globalThis.document;
  globalThis.document = { visibilityState: "visible" };
  t.after(() => {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  });
  t.mock.method(globalThis, "setInterval", (callback, ms) => {
    assert.equal(ms, 5000);
    timer = callback;
    return 42;
  });
  t.mock.method(globalThis, "clearInterval", (id) => {
    assert.equal(id, 42);
    cleared++;
  });
  const Refresh = load("components/RunReportRefresh.tsx", {
    react: { useEffect: (fn) => cleanup.push(fn()) },
    "next/navigation": {
      useRouter: () => ({
        refresh: () => {
          refreshes++;
        },
      }),
    },
  }).default;
  const html = renderToStaticMarkup(Refresh({ active: true }));
  assert.doesNotMatch(html, /<button|Refresh report/i);
  assert.match(html, /updates while agents work/);
  timer();
  assert.equal(refreshes, 1);
  globalThis.document.visibilityState = "hidden";
  timer();
  assert.equal(refreshes, 1);
  cleanup[0]();
  assert.equal(cleared, 1);
  assert.equal(Refresh({ active: false }), null);
});
