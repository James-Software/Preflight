const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load-module.cjs");
const config = load("lib/database-check-config.ts", {});
const records = load("lib/database-records.ts", {
  "@/lib/database-check-config": config,
});
const record = {
  table: "projects",
  key: "id",
  columns: ["name"],
  value: "42",
  fingerprint: "a".repeat(32),
};
const proposal = { record, marker: "preflight-5-0-0-marker" };
function service({ eligible = true, count = 1, changedKey = false } = {}) {
  const events = [];
  let status = "pending",
    contacted = 0;
  const sql = async (parts, ...values) => {
    const q = parts.join("?");
    events.push({ q, values });
    if (q.includes("RETURNING proposal")) {
      if (status !== "pending") return [];
      status = values[0];
      return [{ proposal }];
    }
    if (q.includes("SET status='completed'")) status = "completed";
    if (q.includes("SET status='error'")) status = "error";
    return [];
  };
  const client = {
    query: async (q) => {
      events.push(q);
      return { rowCount: typeof q === "object" ? count : null };
    },
    end: async () => {
      events.push("CLOSE");
    },
  };
  const api = load("lib/database-cleanup.ts", {
    "@/lib/db": { getSql: () => sql },
    "@/lib/database-connections": {
      runDatabaseConfig: async (id, cleanup) => {
        assert.equal(id, 5);
        assert.equal(cleanup, true);
        if (changedKey) throw new config.DatabaseCheckError("Could not unlock");
        return { connectionString: "private-uri" };
      },
    },
    "@/lib/database-check-config": config,
    "@/lib/postgres-verification": {
      postgresClient: async () => {
        contacted++;
        return client;
      },
    },
    "@/lib/database-records": {
      ...records,
      cleanupEligible: async () => eligible,
    },
  });
  return { api, events, status: () => status, contacted: () => contacted };
}
test("cleanup SQL is a single bound DELETE scoped by primary key, marker and full-row fingerprint", () => {
  const text = records.cleanupStatement({
    ...record,
    table: 'projects"; DROP DATABASE app;--',
  });
  assert.ok(text.includes('"projects""; DROP DATABASE app;--"'));
  assert.match(text, /DELETE FROM ONLY public\./);
  assert.match(text, /::text = \$2/);
  assert.match(text, /strpos\(t\."name"::text, \$1\)/);
  assert.match(text, /md5\(row_to_json\(t\)::text\) = \$3/);
});
test("Deny never opens the customer database and cannot later be accepted", async () => {
  const s = service();
  await s.api.decideCleanup(5, "id", "deny");
  assert.equal(s.status(), "denied");
  assert.equal(s.contacted(), 0);
  await assert.rejects(
    s.api.decideCleanup(5, "id", "accept"),
    /already been reviewed/,
  );
  assert.equal(s.contacted(), 0);
});
test("Accept executes only the stored proposal in a locked transaction and cannot run twice", async () => {
  const s = service();
  await s.api.decideCleanup(5, "id", "accept");
  assert.equal(s.status(), "completed");
  assert.equal(s.contacted(), 1);
  assert.ok(s.events.includes("BEGIN"));
  assert.ok(s.events.includes("COMMIT"));
  const execution = s.events.find((e) => e && typeof e === "object" && e.text);
  assert.equal(execution.text, records.cleanupStatement(record));
  assert.deepEqual(execution.values, [proposal.marker, "42", "a".repeat(32)]);
  assert.ok(
    s.events.some(
      (e) => typeof e === "string" && e.startsWith("LOCK TABLE ONLY"),
    ),
  );
  await assert.rejects(
    s.api.decideCleanup(5, "id", "accept"),
    /already been reviewed/,
  );
  assert.equal(s.contacted(), 1);
});
test("Changed/missing rows, dependencies and unavailable keys block cleanup without committing", async () => {
  for (const opts of [
    { count: 0 },
    { count: 2 },
    { eligible: false },
    { changedKey: true },
  ]) {
    const s = service(opts);
    await assert.rejects(s.api.decideCleanup(5, "id", "accept"));
    assert.equal(s.status(), "error");
    assert.ok(!s.events.includes("COMMIT"));
    if (!opts.changedKey) assert.ok(s.events.includes("ROLLBACK"));
  }
});
test("cleanup API checks sign-in, ownership, finished run and request Origin before decisions", async () => {
  const { NextRequest } = require("next/server");
  for (const mode of [
    "anonymous",
    "foreign",
    "running",
    "cross-origin",
    "accepted",
    "denied",
  ]) {
    let touched = 0;
    const api = load("app/api/projects/[id]/runs/[runId]/cleanup/route.ts", {
      "@/auth": {
        auth: async () =>
          mode === "anonymous" ? null : { user: { githubId: "100" } },
      },
      "@/lib/schema": { ensureSchema: async () => {} },
      "@/lib/database-check-config": config,
      "@/lib/auth-profile-state": { ProfileError: class extends Error {} },
      "@/lib/database-cleanup": {
        cleanupContext: async (p, r, o) => {
          assert.deepEqual([p, r, o], [12, 5, "100"]);
          if (mode === "foreign")
            throw new config.DatabaseCheckError("Run unavailable.");
          return { finished: mode !== "running" };
        },
        listCleanup: async () => [],
        decideCleanup: async (r, id, decision) => {
          touched++;
          assert.equal(r, 5);
          assert.equal(decision, mode === "denied" ? "deny" : "accept");
        },
      },
    });
    const req = new NextRequest(
      "https://preflight.test/api/projects/12/runs/5/cleanup",
      {
        method: "POST",
        headers: {
          Origin:
            mode === "cross-origin"
              ? "https://other.test"
              : "https://preflight.test",
        },
        body: JSON.stringify({
          id: "12345678-1234-1234-1234-123456789abc",
          decision: mode === "denied" ? "deny" : "accept",
          sql: "DROP DATABASE ignored",
        }),
      },
    );
    const response = await api.POST(req, {
      params: Promise.resolve({ id: "12", runId: "5" }),
    });
    assert.equal(
      response.status,
      ["accepted", "denied"].includes(mode)
        ? 200
        : mode === "cross-origin"
          ? 403
          : 400,
      mode,
    );
    assert.equal(touched, ["accepted", "denied"].includes(mode) ? 1 : 0, mode);
  }
});
test("automatic verification proposes cleanup only for newly observed marked records, without writing to the customer DB", async () => {
  const events = [];
  let observed = 0;
  const client = {
    query: async (q) => {
      events.push(q);
      return { rows: [] };
    },
    end: async () => {},
  };
  const api = load("lib/automatic-database.ts", {
    "@/lib/database-check-config": config,
    "@/lib/db": {
      getSql:
        () =>
        async (parts, ...values) => {
          events.push({ sql: parts.join("?"), values });
          return [];
        },
    },
    "@/lib/database-connections": {
      runDatabaseConfig: async () => ({ connectionString: "private-uri" }),
    },
    "@/lib/postgres-verification": { postgresClient: async () => client },
    "@/lib/database-records": {
      recordTargets: async () => [
        { table: "projects", key: "id", columns: ["name"] },
      ],
      observeRecords: async () => (++observed < 3 ? [] : [record]),
      cleanupEligible: async () => true,
    },
  });
  const a = await api.automaticDatabase(5, 0, 0);
  assert.match(a.marker, /^preflight-5-0-0-[0-9a-f]{24}$/);
  assert.equal(a.email, `${a.marker}@example.test`);
  assert.ok(a.instructions.includes(a.email));
  assert.ok(!a.instructions.includes("private-uri"));
  const before = await a.before();
  await a.after(before, "Create project");
  await a.close();
  const proposalWrite = events.find((e) =>
    e.sql?.includes("INSERT INTO run_database_cleanup"),
  );
  assert.ok(proposalWrite);
  const stored = JSON.parse(proposalWrite.values[3]);
  assert.deepEqual(stored.record, record);
  assert.equal(stored.marker, a.marker);
  assert.ok(
    events.some(
      (e) =>
        e.sql?.includes("UPDATE run_database_checks") &&
        e.values[0] === "passed",
    ),
  );
  assert.ok(
    events
      .filter((e) => typeof e === "string")
      .every((e) => !/^DELETE|UPDATE|INSERT|DROP|TRUNCATE/i.test(e)),
  );
});
