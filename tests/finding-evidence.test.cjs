const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load-module.cjs");
const api = load("lib/finding-evidence.ts", {});
const origin = "https://app.example";

test("provider authorization is a missing prerequisite, not evidence of app-session loss", () => {
  assert.match(
    api.accessBlocker(origin, "https://github.com/login", []),
    /external sign-in/,
  );
  assert.match(
    api.accessBlocker(origin, origin + "/new", [
      { url: origin + "/api/github/repos", status: 409 },
    ]),
    /GitHub connection/,
  );
  assert.equal(
    api.accessBlocker(origin, origin + "/checkout", [
      { url: origin + "/api/checkout", status: 500 },
    ]),
    null,
  );
});
test("reproduction never repeats submissions, account changes, destructive links or arbitrary form fills", () => {
  for (const name of [
    "Create project",
    "Pay now",
    "Delete",
    "Save",
    "Connect GitHub",
    "Sign out",
  ])
    assert.equal(
      api.safeReplayAction({ action: "click", role: "button", name }, origin),
      false,
    );
  assert.equal(
    api.safeReplayAction({ action: "press", key: "Enter" }, origin),
    false,
  );
  assert.equal(
    api.safeReplayAction(
      { action: "fill", name: "Project name", value: "test" },
      origin,
    ),
    false,
  );
  for (const value of [
    origin + "/api/delete",
    origin + "/logout",
    "https://other.example/",
  ])
    assert.equal(
      api.safeReplayAction({ action: "goto", value }, origin),
      false,
    );
  assert.equal(
    api.safeReplayAction({ action: "goto", value: origin + "/terms" }, origin),
    true,
  );
  assert.equal(
    api.replayEligible(
      [
        {
          action: { action: "goto", value: origin + "/terms" },
          result: "Action failed: timed out",
        },
      ],
      origin,
    ),
    false,
  );
});
test("deduplication ignores agent wording but preserves different browser evidence", () => {
  const signature = api.failureSignature(
    origin + "/terms",
    "heading Error",
    [{ url: origin + "/api/terms", status: 500 }],
    [],
  );
  const actions = (reason) => [
    {
      action: { action: "goto", value: origin + "/terms", reasoning: reason },
      result: "Navigated",
    },
  ];
  assert.equal(
    api.findingEvidenceKey(signature, actions("first agent")),
    api.findingEvidenceKey(signature, actions("different agent")),
  );
  assert.notEqual(
    api.findingEvidenceKey(signature, actions("first")),
    api.findingEvidenceKey(
      api.failureSignature(origin + "/terms", "heading Terms", [], []),
      actions("first"),
    ),
  );
});
