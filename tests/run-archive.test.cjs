const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load-module.cjs");
const { NextRequest } = require("next/server");

function route(options = {}) {
  const calls = [];
  const handler = load("app/api/projects/[id]/runs/[runId]/archive/route.ts", {
    "next/cache": { revalidatePath: (path) => calls.push(["refresh", path]) },
    "@/auth": {
      auth: async () =>
        options.signedOut ? null : { user: { githubId: "100" } },
    },
    "@/lib/schema": {
      getProject: async (id, owner) => {
        calls.push(["project", id, owner]);
        return options.otherOwner ? null : { id };
      },
      setRunArchived: async (...args) => {
        calls.push(["archive", ...args]);
        return !options.unavailable;
      },
    },
  }).PATCH;
  return {
    calls,
    send: (body, origin = "https://preflight.test", id = "1", runId = "2") =>
      handler(
        new NextRequest(
          `https://preflight.test/api/projects/${id}/runs/${runId}/archive`,
          {
            method: "PATCH",
            headers: { origin, "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        ),
        { params: Promise.resolve({ id, runId }) },
      ),
  };
}

test("archive and restore are authenticated, origin-checked and owner-scoped", async () => {
  for (const [options, origin, expected] of [
    [{ signedOut: true }, undefined, 401],
    [{}, "https://other.test", 403],
    [{ otherOwner: true }, undefined, 404],
  ]) {
    const r = route(options);
    assert.equal((await r.send({ archived: true }, origin)).status, expected);
    assert.ok(r.calls.every((call) => call[0] !== "archive"));
  }
  const invalid = route();
  assert.equal((await invalid.send({ archived: "true" })).status, 400);
  assert.equal(
    (await invalid.send({ archived: true }, undefined, "NaN")).status,
    404,
  );
  assert.equal(
    (await invalid.send({ archived: true }, undefined, "1", "-2")).status,
    404,
  );
  assert.deepEqual(invalid.calls, []);
});

test("archive/restore preserve run lifecycle and reject active or unavailable runs", async () => {
  const r = route();
  for (const archived of [true, false]) {
    const result = await r.send({ archived });
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { archived });
  }
  assert.deepEqual(
    r.calls.filter((call) => call[0] === "archive"),
    [
      ["archive", 2, 1, "100", true],
      ["archive", 2, 1, "100", false],
    ],
  );
  assert.ok(
    r.calls.some(
      (call) =>
        call[0] === "refresh" && call[1] === "/dashboard/projects/1/runs/2",
    ),
  );
  const active = route({ unavailable: true });
  const result = await active.send({ archived: true });
  assert.equal(result.status, 409);
  assert.match((await result.json()).error, /Stop active runs/);
});

test("archive SQL changes only visibility, scopes owner/project/run, and requires a terminal status", async () => {
  const queries = [];
  const { setRunArchived } = load("lib/schema.ts", {
    "@/lib/db": {
      getSql:
        () =>
        async (parts, ...values) => {
          const query = parts.join("?");
          if (query.includes("UPDATE runs r SET archived_at")) {
            queries.push({ query, values });
            return [{ id: 2 }];
          }
          return [];
        },
    },
  });
  assert.equal(await setRunArchived(2, 1, "100", true), true);
  assert.deepEqual(queries[0].values, [true, 2, 1, "100", true]);
  assert.match(queries[0].query, /p\.owner_github_id = \?/);
  assert.match(queries[0].query, /r\.project_id = \?/);
  assert.match(queries[0].query, /'done', 'completed', 'failed', 'cancelled'/);
  assert.doesNotMatch(queries[0].query, /SET status|DELETE FROM/);
});
