const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// Transpile isolated server modules so tests can supply session/DB boundaries
// without credentials, a network connection, or a running Next server.
function load(relative, mocks) {
  const filename = path.join(__dirname, "..", relative);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (name) =>
    Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  vm.runInThisContext(`(function(exports,require,module){${code}\n})`, {
    filename,
  })(module.exports, localRequire, module);
  return module.exports;
}
const { safeReturnTo } = load("lib/return-to.ts", {
  "./site": { SITE_URL: "https://www.trypreflight.dev" },
});
test("login preserves an internal deep link, including query parameters", () => {
  assert.equal(
    safeReturnTo("/dashboard/admin/blog/new?from=menu"),
    "/dashboard/admin/blog/new?from=menu",
  );
  assert.equal(
    safeReturnTo("https://www.trypreflight.dev/dashboard/projects/12/runs/34"),
    "/dashboard/projects/12/runs/34",
  );
});
test("login rejects external, malformed, or non-dashboard destinations", () => {
  for (const value of [
    "https://attacker.example/dashboard",
    "//attacker.example/dashboard",
    "/\\attacker.example/dashboard",
    "/dashboard/../../login",
    "/dashboard-evil",
    "javascript:alert(1)",
    "/login",
    undefined,
    ["ignored"],
    "/dashboard\nmalformed",
  ])
    assert.equal(safeReturnTo(value), "/dashboard");
});
test("an inaccessible run never queries findings or diagnosis artifacts", async () => {
  const calls = [];
  const sql = async (parts, ...values) => {
    calls.push({ query: parts.join("?"), values });
    return [];
  };
  const { getRunReport } = load("lib/schema.ts", {
    "@/lib/db": { getSql: () => sql },
  });
  assert.equal(await getRunReport(12, 34, "owner-100"), null);
  const reads = calls.filter((call) => /SELECT/i.test(call.query));
  assert.equal(reads.length, 1);
  assert.match(reads[0].query, /p\.owner_github_id = \?/);
  assert.match(reads[0].query, /r\.project_id = \?/);
  assert.deepEqual(reads[0].values, [34, 12, "owner-100"]);
});
test("run summaries fetch finding counts with the initial history query", async () => {
  let query;
  const sql = async (parts) => {
    const text = parts.join("?");
    if (/SELECT id, project_id/.test(text)) {
      query = text;
      return [{ id: 34, findingsCount: 3 }];
    }
    return [];
  };
  const { listRuns } = load("lib/schema.ts", {
    "@/lib/db": { getSql: () => sql },
  });
  const rows = await listRuns(12);
  assert.equal(rows[0].findingsCount, 3);
  assert.match(
    query,
    /COUNT\(\*\)::int FROM findings WHERE findings\.run_id = runs\.id/,
  );
});
function reportPage(user, getProject, getRunReport) {
  return load("app/dashboard/projects/[id]/runs/[runId]/page.tsx", {
    "@/auth": { auth: async () => (user ? { user } : null) },
    "next/navigation": {
      redirect: (url) => {
        throw Object.assign(new Error("redirect"), { url });
      },
      notFound: () => {
        throw new Error("not-found");
      },
    },
    "@/lib/schema": { getProject, getRunReport },
    "@/components/GitIcons": load("components/GitIcons.tsx", {}),
    "@/components/RunReportRefresh": { default: () => null },
  }).default;
}
test("report redirects a signed-out visitor back through the same run URL", async () => {
  const page = reportPage(
    null,
    () => assert.fail("must not read projects"),
    () => assert.fail("must not read reports"),
  );
  await assert.rejects(
    page({ params: Promise.resolve({ id: "12", runId: "34" }) }),
    (error) =>
      error.url ===
      "/login?callbackUrl=%2Fdashboard%2Fprojects%2F12%2Fruns%2F34",
  );
});
test("report validates IDs and project ownership before reading artifacts", async () => {
  const invalid = reportPage(
    { githubId: "100" },
    () => assert.fail("invalid IDs must not query"),
    () => assert.fail("must not query"),
  );
  await assert.rejects(
    invalid({ params: Promise.resolve({ id: "12", runId: "NaN" }) }),
    /not-found/,
  );
  const otherOwner = reportPage(
    { githubId: "100" },
    async () => null,
    () => assert.fail("must not read another owner’s report"),
  );
  await assert.rejects(
    otherOwner({ params: Promise.resolve({ id: "12", runId: "34" }) }),
    /not-found/,
  );
});
test("updating an app URL remains scoped to its owner", async () => {
  let update;
  const sql = async (parts, ...values) => {
    if (parts.join("").includes("UPDATE projects")) {
      update = { query: parts.join("?"), values };
      return [];
    }
    return [];
  };
  const { updateProjectAppUrl } = load("lib/schema.ts", {
    "@/lib/db": { getSql: () => sql },
  });
  assert.equal(
    await updateProjectAppUrl(12, "other-owner", "https://example.com"),
    false,
  );
  assert.match(update.query, /owner_github_id = \?/);
  assert.deepEqual(update.values, ["https://example.com", 12, "other-owner"]);
});
