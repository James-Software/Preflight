const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { PGlite } = require("@electric-sql/pglite");
const { load } = require("./load-module.cjs");
const { randomUUID } = require("node:crypto");
test("requested retry is owner-scoped, creates one fresh run, preserves original evidence and survives dispatch retries", async () => {
  const db = new PGlite();
  const sql = async (parts, ...v) => {
    const q = parts.reduce(
      (s, p, i) => s + p + (i < v.length ? "$" + (i + 1) : ""),
      "",
    );
    return (await db.query(q, v)).rows;
  };
  const deps = { "@/lib/db": { getSql: () => sql } },
    schema = load("lib/schema.ts", deps),
    api = load("lib/requested-run-retry.ts", {
      ...deps,
      "@/lib/schema": schema,
    });
  try {
    await schema.ensureSchema();
    const p = await schema.createProject(
        "owner",
        "https://example.test",
        "owner/app",
      ),
      r = await schema.createRun(p.id, "https://example.test");
    await sql`UPDATE runs SET status='partial',failure_reason='Original evidence',database_snapshot='{"id":7}'::jsonb WHERE id=${r.id}`;
    const id = randomUUID();
    await sql`INSERT INTO run_retry_requests(id,source_run_id,requested_owner) VALUES(${id},${r.id},'stranger')`;
    assert.equal(await api.claimRequestedRunRetry(), null);
    await sql`UPDATE run_retry_requests SET requested_owner='owner' WHERE id=${id}`;
    const first = await api.claimRequestedRunRetry();
    assert.ok(first.new_run_id !== r.id);
    assert.equal(first.attempts, 1);
    assert.equal(await api.claimRequestedRunRetry(), null);
    await sql`UPDATE run_retry_requests SET status='queued' WHERE id=${id}`;
    const retry = await api.claimRequestedRunRetry();
    assert.equal(retry.new_run_id, first.new_run_id);
    assert.equal(
      (await sql`SELECT count(*)::int AS count FROM runs`)[0].count,
      2,
    );
    const original = (
      await sql`SELECT status,failure_reason FROM runs WHERE id=${r.id}`
    )[0];
    assert.deepEqual(original, {
      status: "partial",
      failure_reason: "Original evidence",
    });
    await sql`UPDATE runs SET archived_at=NOW() WHERE id=${r.id}`;
    await sql`UPDATE run_retry_requests SET status='queued' WHERE id=${id}`;
    assert.equal(await api.claimRequestedRunRetry(), null);
  } finally {
    await db.close();
  }
});
