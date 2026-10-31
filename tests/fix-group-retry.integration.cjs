const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { PGlite } = require("@electric-sql/pglite");
const { chromium } = require("playwright-core");
const { load } = require("./load-module.cjs");
(async () => {
  const root = path.resolve(__dirname, ".."),
    db = new PGlite();
  const sql = async (parts, ...values) =>
    (
      await db.query(
        parts.reduce(
          (q, p, i) => q + p + (i < values.length ? "$" + (i + 1) : ""),
          "",
        ),
        values,
      )
    ).rows;
  const deps = { "@/lib/db": { getSql: () => sql } },
    schema = load("lib/schema.ts", deps);
  const groups = load("lib/fix-groups.ts", { ...deps, "@/lib/schema": schema });
  let browser,
    child,
    bridge,
    fixture,
    actor = "owner";
  const requests = [],
    opened = [];
  try {
    await schema.ensureSchema();
    const project = await schema.createProject(
      "owner",
      "https://example.test",
      "owner/app",
    );
    async function seed(titles) {
      const run = await schema.createRun(project.id, "https://example.test");
      await schema.updateRunStatus(run.id, "done");
      const ids = [];
      for (const title of titles) {
        await schema.createFinding({
          runId: run.id,
          agentId: null,
          title,
          severity: "medium",
          reproSteps: "Observed",
          screenshotUrl: null,
          consoleLogs: null,
          networkErrors: [],
        });
        const f = (
          await sql`SELECT id FROM findings WHERE run_id=${run.id} ORDER BY id DESC LIMIT 1`
        )[0];
        ids.push(f.id);
        await sql`INSERT INTO diagnoses(finding_id,patch_diff,confidence) VALUES(${f.id},'fixture-patch','proposed')`;
      }
      const group = await groups.reserveFixGroup(
        "owner",
        project.id,
        run.id,
        ids.slice(0, titles.length === 1 ? 1 : 2),
        randomUUID(),
      );
      await groups.failFixGroup(
        group.id,
        "GitHub App permissions need approval.",
      );
      return { run, ids, group };
    }
    const single = await seed(["Waitlist does not save"]),
      mixed = await seed([
        "First grouped finding",
        "Second grouped finding",
        "Ungrouped finding",
      ]);
    const concurrent = await seed(["Concurrent retry"]);
    // Release a fixture reservation to exercise two new tabs racing to claim it.
    await groups.releaseInvalidFixGroup(concurrent.group.id);
    const raced = await Promise.all([randomUUID(), randomUUID()].map(key =>
      groups.reserveFixGroup("owner", project.id, concurrent.run.id, concurrent.ids, key)));
    assert.equal(raced[0].id, raced[1].id);
    const leases = await Promise.allSettled(raced.map(group => groups.acquireFixGroup(group.id)));
    assert.equal(leases.filter(result => result.status === "fulfilled").length, 1);
    await groups.releaseFixGroupLease(raced[0].id);
    const recovered = await groups.reserveFixGroup(
      "owner",
      project.id,
      single.run.id,
      single.ids,
      randomUUID(),
    );
    assert.equal(recovered.id, single.group.id);
    assert.equal(recovered.branch, single.group.branch);
    assert.equal(
      (
        await sql`SELECT count(*)::int AS n FROM fix_pr_groups WHERE run_id=${single.run.id}`
      )[0].n,
      1,
    );
    await assert.rejects(
      groups.reserveFixGroup(
        "stranger",
        project.id,
        single.run.id,
        single.ids,
        randomUUID(),
      ),
    );
    await assert.rejects(
      groups.reserveFixGroup(
        "owner",
        project.id,
        mixed.run.id,
        [mixed.ids[0]],
        mixed.group.id,
      ),
    );
    await assert.rejects(
      groups.reserveFixGroup(
        "owner",
        project.id,
        mixed.run.id,
        [mixed.ids[0], mixed.ids[2]],
        randomUUID(),
      ),
    );
    assert.deepEqual(
      (
        await sql`SELECT id,pr_group_id FROM findings WHERE run_id=${mixed.run.id} ORDER BY id`
      ).map((f) => f.pr_group_id),
      [mixed.group.id, mixed.group.id, null],
    );
    const ctx = { login: "owner", accessToken: "fixture-only" };
    class GithubAuthError extends Error {}
    class FixPatchError extends Error {}
    const POST = load("app/api/projects/[id]/runs/[runId]/findings/route.ts", {
      ...deps,
      "@/auth": { auth: async () => ({ user: { githubId: actor } }) },
      "@/lib/schema": schema,
      "@/lib/fix-groups": groups,
      "@/lib/project-github": {
        projectGithubContext: async () => ctx,
        ProjectGithubError: class extends Error {},
      },
      "@/lib/github": { GithubAuthError },
      "@/lib/github-credentials": {
        GithubRenewalUnavailable: class extends Error {},
      },
      "@/lib/fix-github-grant": {},
      "@/lib/trigger-client": {},
      "@trigger.dev/sdk": {},
      "next/cache": { revalidatePath: () => {} },
      "@/lib/fix-pull-request": {
        FixPatchError,
        openFixPullRequest: async (_ctx, repo, branch, fixes) => {
          opened.push({ repo, branch, ids: fixes.map((f) => f.id) });
          return {
            number: opened.length,
            html_url: `https://github.com/owner/app/pull/${opened.length}`,
          };
        },
      },
    }).POST;
    // Bridge real API/group helpers and PostgreSQL to the actual production UI.
    bridge = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, "http://fixture");
        res.setHeader("content-type", "application/json");
        if (req.method === "POST") {
          let raw = "";
          for await (const c of req) raw += c;
          const body = JSON.parse(raw);
          requests.push(body);
          const runId = Number(url.pathname.split("/")[5]);
          const request = {
            headers: new Headers({ origin: "https://preflight.test" }),
            nextUrl: new URL("https://preflight.test" + url.pathname),
            json: async () => body,
          };
          const result = await POST(request, {
            params: Promise.resolve({
              id: String(project.id),
              runId: String(runId),
            }),
          });
          res.statusCode = result.status;
          res.end(JSON.stringify(await result.json()));
          return;
        }
        const runId =
          url.searchParams.get("case") === "mixed"
            ? mixed.run.id
            : single.run.id;
        res.end(
          JSON.stringify({
            projectId: project.id,
            runId,
            findings: (await schema.getRunReport(project.id, runId, "owner"))
              .findings,
          }),
        );
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    await new Promise((r) => bridge.listen(0, "127.0.0.1", r));
    const bridgeUrl = `http://127.0.0.1:${bridge.address().port}`;
    fs.mkdirSync(path.join(root, "work"), { recursive: true });
    fixture = fs.mkdtempSync(path.join(root, "work", "fix-retry-ui-"));
    const relative = (p) =>
      JSON.stringify(
        path.relative(path.join(fixture, "app"), path.join(root, p)),
      );
    fs.mkdirSync(
      path.join(
        fixture,
        "app",
        "api",
        "projects",
        "[id]",
        "runs",
        "[runId]",
        "findings",
      ),
      { recursive: true },
    );
    fs.writeFileSync(
      path.join(fixture, "package.json"),
      JSON.stringify({ name: "fix-retry-browser-fixture", private: true }),
    );
    fs.writeFileSync(
      path.join(fixture, "next.config.mjs"),
      `export default {turbopack:{root:${JSON.stringify(root)}}}`,
    );
    fs.writeFileSync(
      path.join(fixture, "tsconfig.json"),
      JSON.stringify({
        extends: path.relative(fixture, path.join(root, "tsconfig.json")),
        compilerOptions: {
          paths: { "@/*": [path.relative(fixture, root) + "/*"] },
        },
      }),
    );
    fs.writeFileSync(
      path.join(fixture, "postcss.config.mjs"),
      `export default {plugins:{'@tailwindcss/postcss':{}}}`,
    );
    fs.writeFileSync(
      path.join(fixture, "app", "layout.js"),
      `import ${relative("app/globals.css")};export default function Layout({children}){return <html lang="en"><body><header>Preflight</header>{children}</body></html>}`,
    );
    fs.writeFileSync(
      path.join(fixture, "app", "page.js"),
      `import FixesTable from ${relative("components/FixesTable.tsx")};export default async function Page({searchParams}){const params=await searchParams;const data=await(await fetch(${JSON.stringify(bridgeUrl)}+'/?case='+encodeURIComponent(params.case||''),{cache:'no-store'})).json();return <main className="p-6"><FixesTable {...data}/></main>}`,
    );
    fs.writeFileSync(
      path.join(
        fixture,
        "app",
        "api",
        "projects",
        "[id]",
        "runs",
        "[runId]",
        "findings",
        "route.js",
      ),
      `export async function POST(request){const r=await fetch(${JSON.stringify(bridgeUrl)}+new URL(request.url).pathname,{method:'POST',body:await request.text()});return Response.json(await r.json(),{status:r.status})}`,
    );
    const reserve = http.createServer();
    await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
    const port = reserve.address().port;
    await new Promise((r) => reserve.close(r));
    const log = fs.openSync(path.join(fixture, "server.log"), "w");
    child = spawn(
      process.execPath,
      [
        require.resolve("next/dist/bin/next"),
        "dev",
        fixture,
        "-H",
        "127.0.0.1",
        "-p",
        String(port),
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          NODE_ENV: "development",
          NEXT_TELEMETRY_DISABLED: "1",
        },
        stdio: ["ignore", log, log],
      },
    );
    fs.closeSync(log);
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw Error("Fixture server stopped");
      try {
        if ((await fetch(base)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 300));
    }
    assert.ok(ready, "Fixture did not start");
    browser = await chromium.launch({
      executablePath: require("./browser-fixture.cjs").chromiumPath,
      args: ["--no-sandbox"],
    });
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    await page.goto(base, { waitUntil: "networkidle" });
    assert.equal(
      await page
        .getByRole("button", { name: "Retry PR (1)", exact: true })
        .isEnabled(),
      true,
      "Global action resumes when no new findings remain",
    );
    await page
      .getByRole("checkbox", { name: "Select Waitlist does not save" })
      .check();
    const selectedRetry = page
      .getByRole("button", { name: "Retry PR (1)", exact: true })
      .last();
    assert.equal(await selectedRetry.isEnabled(), true);
    await selectedRetry.click();
    await page.getByRole("link", { name: "PR #1", exact: true }).waitFor();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].groupId, single.group.id);
    assert.deepEqual(opened[0].ids, single.ids);
    assert.equal(opened[0].branch, single.group.branch);
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(
      await page.getByRole("link", { name: "PR #1", exact: true }).isVisible(),
      true,
    );
    await page
      .getByRole("checkbox", { name: "Select Waitlist does not save" })
      .check();
    assert.equal(
      await page
        .getByRole("button", { name: "Open PR (1)", exact: true })
        .isDisabled(),
      true,
    );
    const again = await groups.reserveFixGroup(
      "owner",
      project.id,
      single.run.id,
      single.ids,
      randomUUID(),
    );
    assert.equal(again.pr_number, 1);
    assert.equal(again.id, single.group.id);
    await page.goto(base + "/?case=mixed", { waitUntil: "networkidle" });
    await page
      .getByRole("checkbox", { name: "Select First grouped finding" })
      .check();
    await page
      .getByRole("checkbox", { name: "Select Ungrouped finding" })
      .check();
    assert.equal(
      await page
        .getByRole("button", { name: "Open PR (2)", exact: true })
        .isDisabled(),
      true,
    );
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    for (const title of ["First grouped finding", "Second grouped finding"])
      await page.getByRole("checkbox", { name: "Select " + title }).check();
    assert.equal(
      await page
        .getByRole("button", { name: "Retry PR (2)", exact: true })
        .isEnabled(),
      true,
    );
    await page
      .getByRole("button", { name: "Open PR for all (1)", exact: true })
      .click();
    await page.getByRole("link", { name: "PR #2", exact: true }).waitFor();
    assert.deepEqual(opened[1].ids, [mixed.ids[2]]);
    assert.equal(
      (
        await sql`SELECT state FROM fix_pr_groups WHERE id=${mixed.group.id}::uuid`
      )[0].state,
      "pending",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(
      await page
        .getByRole("button", { name: "Retry PR (2)", exact: true })
        .isEnabled(),
      true,
    );
    await page.screenshot({
      path: path.join(root, "work", "fix-group-retry-mobile.png"),
      fullPage: true,
    });
    assert.equal(requests.length, 2);
    assert.equal(
      (
        await sql`SELECT count(*)::int AS n FROM fix_pr_groups WHERE run_id=${single.run.id}`
      )[0].n,
      1,
    );
    console.log(
      JSON.stringify({
        realPostgres: true,
        actualProductionComponent: true,
        realChromium: true,
        failedGroupResumable: true,
        freshRequestUuidReusesOriginalGroup: true,
        oneOriginalBranch: true,
        partialAndMixedRegroupingDenied: true,
        foreignOwnerDenied: true,
        openPrReusedAfterRefresh: true,
        newFindingsOnlyInNewGroup: true,
        mobileRetryAvailable: true,
        concurrentRequestsShareOneGroupAndLease: true,
      }),
    );
  } finally {
    await browser?.close();
    if (child && !child.killed) {
      child.kill("SIGTERM");
      await Promise.race([
        new Promise((r) => child.once("exit", r)),
        new Promise((r) => setTimeout(r, 3000)),
      ]);
    }
    if (bridge?.listening) await new Promise((r) => bridge.close(r));
    await db.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
