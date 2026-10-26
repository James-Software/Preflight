const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load-module.cjs");
const patches = load("lib/fix-patches.ts", {});
const generated = load("lib/generated-fix-patches.ts", {
  "@/lib/fix-patches": patches,
});
const prompts = load("lib/finding-prompts.ts", {});
test("three selected bugs copy as three compact paragraphs separated into sections", () => {
  const bugs = [1, 2, 3].map((id) => ({
    id,
    title: `Bug ${id}`,
    fix_summary:
      "Observed bug.\n\nFix the handler\n and add a regression test.",
    root_cause: null,
    repro_steps: "Private long trace ".repeat(300),
  }));
  const text = prompts.findingsPrompt(bugs);
  assert.equal((text.match(/^### Bug /gm) || []).length, 3);
  assert.equal(text.split("\n\n---\n\n").length, 3);
  assert.equal(
    (
      text.match(
        /Observed bug\. Fix the handler and add a regression test\./g,
      ) || []
    ).length,
    3,
  );
  assert.ok(!text.includes("Private long trace"));
  assert.ok(text.length < 600);
  assert.equal(
    prompts.findingsPrompt(bugs.slice(1, 2)).includes("Bug 1"),
    false,
  );
  const legacy = prompts.findingFixParagraph({ ...bugs[0], fix_summary: null });
  assert.ok(!legacy.includes("\n"));
  assert.ok(legacy.length < 1000);
});
test("generated exact edits form minimal mergeable patches against the same base", () => {
  const source = "first\nsecond\nthird\nfourth\n",
    files = new Map([["app.ts", source]]);
  const a = generated.editsToPatch(files, [
    { path: "app.ts", search: "second", replace: "fixed second\nnew line" },
  ]);
  const b = generated.editsToPatch(files, [
    { path: "app.ts", search: "fourth", replace: "fixed fourth" },
  ]);
  assert.equal(
    patches.mergePatches(source, [
      ...patches.parsePatch(a),
      ...patches.parsePatch(b),
    ]),
    "first\nfixed second\nnew line\nthird\nfixed fourth\n",
  );
  for (const edits of [
    [{ path: "../secret", search: "second", replace: "x" }],
    [{ path: "app.ts", search: "missing", replace: "x" }],
    [{ path: "app.ts", search: "second", replace: "second" }],
    [
      { path: "app.ts", search: "second", replace: "x" },
      { path: "app.ts", search: "second", replace: "y" },
    ],
  ])
    assert.throws(() => generated.editsToPatch(files, edits));
  assert.throws(
    () =>
      generated.editsToPatch(new Map([["app.ts", "repeat\nrepeat\n"]]), [
        { path: "app.ts", search: "repeat", replace: "changed" },
      ]),
    /ambiguous/,
  );
  const noNewline = generated.editsToPatch(
    new Map([["app.ts", "first\nsecond"]]),
    [{ path: "app.ts", search: "second", replace: "fixed" }],
  );
  assert.equal(
    patches.applyPatch("first\nsecond", patches.parsePatch(noNewline)[0]),
    "first\nfixed",
  );
});
test("schema labels use the PostgreSQL text-array wire parser instead of the unsupported name-array parser", async () => {
  const { types } = require("pg");
  assert.equal(typeof types.getTypeParser(1003)("{name,title}"), "string");
  const records = load("lib/database-records.ts", {
    "@/lib/database-check-config": load("lib/database-check-config.ts", {}),
  });
  const targets = await records.recordTargets({
    query: async (q) => ({
      rows: [
        {
          table: "projects",
          key: "id",
          columns: types.getTypeParser(
            q.includes("a.attname::text") ? 1009 : 1003,
          )("{name,title}"),
        },
      ],
    }),
  });
  assert.deepEqual(targets[0].columns, ["name", "title"]);
});
test("historical repeated database setup failures collapse once and are excluded from assertion totals", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const Results = load("components/DatabaseCheckResults.tsx", {}).default;
  const checks = Array.from({ length: 12 }, (_, i) => ({
    check_id: `auto-unavailable-${i}`,
    title: "Automatic database verification",
    button_label: "Automatic",
    status: "error",
    summary: "Could not inspect the database.",
    completed_at: null,
  }));
  const html = renderToStaticMarkup(React.createElement(Results, { checks }));
  assert.equal(
    (html.match(/Could not inspect the database\./g) || []).length,
    1,
  );
  assert.ok(!html.includes("0 of 12"));
  assert.ok(html.includes("No database assertions completed"));
});
test("identical automatic database results share one row while preserving observed-action totals", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const Results = load("components/DatabaseCheckResults.tsx", {}).default;
  const check = {
    title: "Automatic: Create project",
    button_label: "Create project",
    status: "passed",
    summary: "Confirmed a change to uniquely marked test records.",
    completed_at: null,
  };
  const html = renderToStaticMarkup(
    React.createElement(Results, {
      checks: [
        { ...check, check_id: "auto-1-0-0-abcdef01" },
        { ...check, check_id: "auto-3-0-0-abcdef02" },
      ],
    }),
  );
  assert.equal((html.match(/Automatic: Create project/g) || []).length, 1);
  assert.equal(
    (html.match(/Confirmed a change to uniquely marked test records\./g) || [])
      .length,
    1,
  );
  assert.match(html, /2 observations/);
  assert.match(html, /2 of 2 database checks/);
});
test("different outcomes and separate configured database checks are not hidden by grouping", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const Results = load("components/DatabaseCheckResults.tsx", {}).default;
  const check = {
    title: "Automatic: Create project",
    button_label: "Create project",
    status: "passed",
    summary: "Saved.",
    completed_at: null,
  };
  const html = renderToStaticMarkup(
    React.createElement(Results, {
      checks: [
        { ...check, check_id: "auto-1-0-0-abcdef01" },
        {
          ...check,
          check_id: "auto-3-0-0-abcdef02",
          status: "error",
          summary: "No marked change observed.",
        },
        { ...check, check_id: "configured-a" },
        { ...check, check_id: "configured-b" },
      ],
    }),
  );
  assert.equal((html.match(/Automatic: Create project/g) || []).length, 4);
  assert.match(html, /No marked change observed/);
  assert.match(html, /3 of 4 database checks/);
});
test("the fix generator reads bounded source files at an immutable SHA and rejects unexpected edits", async () => {
  let count = 0;
  const calls = [];
  const api = load("lib/generate-fix-patches.ts", {
    "@/lib/github": {
      fetchGithub: async (_ctx, url) => {
        calls.push(url);
        const p = new URL(url).pathname;
        if (p.endsWith("/repos/owner/app"))
          return Response.json({ default_branch: "main" });
        if (p.includes("/git/ref/"))
          return Response.json({ object: { sha: "head-sha" } });
        if (p.includes("/git/trees/"))
          return Response.json({
            tree: [
              { type: "blob", mode: "100644", path: "app.ts", size: 20 },
              { type: "blob", mode: "100644", path: ".env", size: 20 },
              { type: "blob", mode: "120000", path: "link.ts", size: 20 },
            ],
          });
        if (p.includes("/contents/")) {
          assert.ok(url.endsWith("?ref=head-sha"));
          return Response.json({
            type: "file",
            encoding: "base64",
            size: 20,
            content: Buffer.from("const broken = true;\n").toString("base64"),
          });
        }
        assert.fail(url);
      },
    },
    "@/lib/models": {
      fixModelJson: async (_s, input) => {
        if (count++ === 0) {
          assert.deepEqual(input.paths, ["app.ts"]);
          return { paths: ["app.ts"] };
        }
        return {
          fixes: [
            {
              id: 1,
              summary:
                "The boolean is wrong. Correct it and test the interaction.",
              edits: [
                {
                  path: "app.ts",
                  search: "const broken = true;",
                  replace: "const broken = false;",
                },
              ],
            },
          ],
        };
      },
    },
    "@/lib/generated-fix-patches": generated,
    "@/lib/finding-prompts": prompts,
  });
  const fixes = await api.generateFixPatches(
    { login: "owner", accessToken: "private-token" },
    "owner/app",
    [{ id: 1, title: "Broken interaction", repro_steps: "Click the button" }],
  );
  assert.match(fixes[0].patch, /\+const broken = false;/);
  assert.ok(calls.every((url) => !url.includes("private-token")));
  await assert.rejects(
    api.generateFixPatches({ login: "other" }, "owner/app", []),
    /own repository/,
  );
});

test("a reserved PR worker prepares missing patches, persists paragraphs and opens only a draft for the selected group", async () => {
  for (const fail of [false, true]) {
    const calls = [];
    const rows = [
      { id: 1, title: "Bug", pr_group_id: "group", patch_diff: null },
    ];
    const task = load("src/trigger/prepare-fix-pr.ts", {
      "@trigger.dev/sdk": { task: (config) => config },
      "@/lib/db": {
        getSql:
          () =>
          async (parts, ...v) => {
            const q = parts.join("?");
            calls.push({ q, v });
            return q.includes("SELECT * FROM fix_pr_groups")
              ? [
                  {
                    id: "group",
                    run_id: 2,
                    finding_ids: [1],
                    branch: "preflight/group",
                    pr_url: null,
                    github_grant: "encrypted-test-grant",
                  },
                ]
              : [];
          },
      },
      "@/lib/schema": {
        getProject: async () => ({ repo_full_name: "owner/new" }),
        getRunReport: async () => ({
          run: { repo_full_name: "owner/original" },
          findings: rows,
        }),
      },
      "@/lib/fix-github-grant": {
        openFixGithubGrant: () => ({
          accessToken: "private-token",
          login: "owner",
        }),
        clearFixGithubGrant: async () => {},
      },
      "@/lib/fix-groups": {
        claimFixWork: async () => true,
        releaseFixWork: async () => {},
        completeFixGroup: async () => calls.push("complete"),
        failFixGroup: async () => calls.push("failed"),
        releaseFixGroupLease: async () => calls.push("released"),
      },
      "@/lib/generate-fix-patches": {
        generateFixPatches: async (_ctx, repo, findings) => {
          assert.equal(repo, "owner/original");
          assert.deepEqual(
            findings.map((f) => f.id),
            [1],
          );
          if (fail) throw new Error("Cannot justify a code fix");
          return [
            {
              id: 1,
              summary: "One compact fix paragraph.",
              patch: "validated-patch",
            },
          ];
        },
      },
      "@/lib/fix-pull-request": {
        openFixPullRequest: async (
          _ctx,
          repo,
          _branch,
          findings,
          _url,
          draft,
        ) => {
          assert.equal(repo, "owner/original");
          assert.equal(draft, true);
          assert.equal(findings[0].patch_diff, "validated-patch");
          calls.push("pr");
          return {
            html_url: "https://github.com/owner/original/pull/1",
            number: 1,
          };
        },
      },
      "@/lib/site": { SITE_URL: "https://preflight.test" },
    }).prepareFixPr;
    if (fail) {
      await assert.rejects(
        task.run({ groupId: "group", projectId: 1, runId: 2, owner: "100" }),
        /Cannot justify/,
      );
      assert.ok(calls.includes("failed"));
      assert.ok(!calls.includes("pr"));
    } else {
      await task.run({
        groupId: "group",
        projectId: 1,
        runId: 2,
        owner: "100",
      });
      assert.ok(calls.some((c) => c.q?.includes("INSERT INTO diagnoses")));
      assert.ok(
        calls.some((c) => c.q?.includes("UPDATE findings SET fix_summary")),
      );
      assert.ok(calls.includes("complete"));
    }
    assert.equal(calls.at(-1), "released");
  }
});

test("short-lived GitHub fix grants are encrypted and bound to the selected group and owner", () => {
  const grant = load("lib/fix-github-grant.ts", {
    "@/lib/auth-profile-state": { profileKey: () => Buffer.alloc(32, 4) },
    "@/lib/db": {},
  });
  const ctx = { login: "owner", accessToken: "private-access-token" };
  const encrypted = grant.sealFixGithubGrant("group-a", "100", ctx);
  assert.ok(!encrypted.includes("private-access-token"));
  assert.deepEqual(grant.openFixGithubGrant(encrypted, "group-a", "100"), ctx);
  assert.throws(
    () => grant.openFixGithubGrant(encrypted, "group-b", "100"),
    /expired|unlocked/,
  );
  assert.throws(
    () => grant.openFixGithubGrant(encrypted, "group-a", "other"),
    /expired|unlocked/,
  );
});
