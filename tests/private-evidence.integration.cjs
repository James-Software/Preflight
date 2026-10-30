require("node:module").registerHooks({ resolve(s, c, next) { return next(s === "next/server" ? s + ".js" : s, c); } });
const assert = require("node:assert/strict");
const sharp = require("sharp");
const { PGlite } = require(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const { NextRequest } = require("next/server");
const { load } = require("./load-module.cjs");

(async () => {
  const db = new PGlite();
  const sql = async (parts, ...values) => { let q = parts[0]; values.forEach((_, i) => { q += `$${i + 1}` + parts[i + 1]; }); return (await db.query(q, values)).rows; };
  const deps = { "@/lib/db": { getSql: () => sql } };
  const schema = load("lib/schema.ts", deps);
  const site = { SITE_URL: "https://preflight.example" };
  const evidence = load("lib/evidence.ts", { ...deps, "@/lib/schema": schema, "@/lib/site": site });
  const grants = load("lib/run-agent-access.ts", { ...deps, "@/lib/schema": schema, "@/lib/site": site });
  let actor = "owner", blobDeletes = 0, failDelete = true, blobReads = 0, blobListing = [];
  const route = load("app/api/runs/[runId]/screenshots/[screenshotId]/route.ts", {
    ...deps, "@/lib/schema": schema, "@/lib/run-agent-access": grants,
    "@/auth": { auth: async () => actor ? { user: { githubId: actor } } : null },
  });
  const jpeg = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#223344" } }).jpeg().toBuffer();
  const retention = load("lib/screenshot-retention.ts", {
    ...deps, "@/lib/schema": schema, "@/lib/site": site, "@/lib/evidence": evidence,
    "@vercel/blob": {
      list: async () => ({ blobs: blobListing, hasMore: false }),
      get: async (url, options) => { blobReads++; assert.equal(options.access, "public"); return { statusCode: 200, blob: { size: jpeg.length }, stream: new ReadableStream({ start(c) { c.enqueue(jpeg); c.close(); } }) }; },
      del: async () => { blobDeletes++; if (failDelete) throw new Error("fixture unavailable"); },
    },
  });
  const request = async (url, bearer) => {
    const parsed = new URL(url), parts = parsed.pathname.split("/");
    return route.GET(new NextRequest(url, { headers: bearer ? { Authorization: `Bearer ${bearer}` } : {} }), { params: Promise.resolve({ runId: parts[3], screenshotId: parts[5] }) });
  };
  try {
    await schema.ensureSchema();
    const project = await schema.createProject("owner", "https://app.example", "owner/app");
    const foreign = await schema.createProject("other", "https://other.example", "other/app");
    const run = await schema.createRun(project.id, "https://app.example");
    const otherRun = await schema.createRun(foreign.id, "https://other.example");
    await schema.updateRunStatus(run.id, "running");
    const url = await evidence.uploadScreenshot(run.id, 0, 0, jpeg);
    assert.equal(new URL(url).origin, site.SITE_URL);
    actor = null; assert.equal((await request(url)).status, 401);
    actor = "other"; assert.equal((await request(url)).status, 404);
    actor = "owner";
    const visible = await request(url);
    assert.equal(visible.status, 200);
    assert.equal(visible.headers.get("cache-control"), "private, no-store, max-age=0");
    assert.deepEqual(Buffer.from(await visible.arrayBuffer()), jpeg);
    await sql`INSERT INTO project_members(project_id,user_id,github_login,email) VALUES(${project.id},'member','member','member@example.test')`;
    actor = "member"; assert.equal((await request(url)).status, 200);
    await sql`DELETE FROM project_members WHERE project_id=${project.id}`;
    assert.equal((await request(url)).status, 404);
    actor = "owner";
    const prompt = (await grants.createRunAgentGrant(project.id, run.id, "owner", "owner")).prompt;
    const token = prompt.match(/pf_run_[A-Za-z0-9_-]{43}/)[0];
    actor = null;
    assert.equal((await request(url, token)).status, 200);
    const screenshotId = new URL(url).pathname.split("/").at(-1);
    assert.equal((await request(evidence.screenshotUrl(otherRun.id, screenshotId), token)).status, 401);
    await sql`UPDATE run_agent_grants SET revoked_at=NOW()`;
    assert.equal((await request(url, token)).status, 401);
    actor = "owner";
    const old = `https://fixture.public.blob.vercel-storage.com/preflight/runs/${run.id}/agent-0-step-3-AbCd.jpg`;
    await schema.createFinding({ runId: run.id, agentId: null, severity: "medium", title: "Legacy screenshot", reproSteps: null, screenshotUrl: old, consoleLogs: null, networkErrors: [] });
    const first = await retention.privatizeLegacyScreenshots();
    assert.deepEqual(first, { migrated: 1, deleted: 0, failed: 1 });
    const migrated = (await sql`SELECT screenshot_url FROM findings WHERE run_id=${run.id}`)[0].screenshot_url;
    assert.notEqual(migrated, old);
    assert.equal((await request(migrated)).status, 200);
    assert.equal((await sql`SELECT count(*)::int AS count FROM retired_screenshot_blobs WHERE deleted_at IS NULL`)[0].count, 1);
    failDelete = false;
    assert.deepEqual(await retention.privatizeLegacyScreenshots(), { migrated: 0, deleted: 1, failed: 0 });
    assert.equal(blobReads, 1); assert.equal(blobDeletes, 2);
    assert.equal((await sql`SELECT count(*)::int AS count FROM run_screenshots`)[0].count, 2);
    const orphan = `https://fixture.public.blob.vercel-storage.com/preflight/runs/${run.id}/agent-0-step-4-AbCd.jpg`;
    const unknown = 'https://fixture.public.blob.vercel-storage.com/preflight/runs/99999/agent-0-step-4-AbCd.jpg';
    blobListing = [{ url: orphan, uploadedAt: new Date() }, { url: unknown, uploadedAt: new Date() }];
    assert.deepEqual(await retention.privatizeLegacyScreenshots(), { migrated: 2, deleted: 2, failed: 0 });
    assert.equal((await sql`SELECT count(*)::int AS count FROM run_screenshots`)[0].count, 3);
    assert.equal((await sql`SELECT count(*)::int AS count FROM retired_screenshot_blobs WHERE private_content IS NOT NULL`)[0].count, 1);
    assert.deepEqual(await retention.privatizeLegacyScreenshots(), { migrated: 0, deleted: 0, failed: 0 });
    await sql`UPDATE projects SET screenshot_retention_days=1 WHERE id=${project.id}`;
    await sql`UPDATE run_screenshots SET created_at=NOW()-INTERVAL '2 days'`;
    assert.equal(await retention.expirePrivateScreenshots(), 3);
    assert.equal((await request(migrated)).status, 404);
    assert.equal((await sql`SELECT screenshot_url FROM findings WHERE run_id=${run.id}`)[0].screenshot_url, null);
    await schema.cancelRun(run.id, project.id);
    await assert.rejects(evidence.uploadScreenshot(run.id, 0, 1, jpeg), /no longer save/);
    console.log(JSON.stringify({ privateImageBytes: true, anonymousAndForeignDenied: true, currentMembersOnly: true, scopedBearerSupported: true, revokedAndOtherRunBearerDenied: true, publicLegacyPreservedPrivately: true, publicDeletionRetryDurable: true, unreferencedImagesPrivatized: true, unownedImagesInPrivateVault: true, migrationIdempotent: true, privateRetentionAtomic: true, cancelledRunCannotUpload: true }));
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
