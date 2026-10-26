const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load-module.cjs");
const config = load("lib/database-check-config.ts", {});
const valid = () => ({
  title: "Task is saved",
  instructions: "Create a task titled {{marker}}, then click Save.",
  buttonLabel: "Save",
  query: "SELECT count(*) AS value FROM tasks WHERE title=$1",
  operator: "equals",
  expected: 1,
});
test("checks pair a browser workflow with a bound marker and one deterministic expectation", () => {
  const [check] = config.parseDatabaseChecks([valid()]);
  assert.ok(check.id);
  assert.equal(
    config.checkMarker(12, check.id),
    `preflight-12-${check.id.slice(0, 8)}`,
  );
  config.checkObservable(check, 0, "marker");
  assert.equal(config.checkPassed(check, 0, 1, "marker"), true);
  assert.equal(config.checkPassed(check, 0, 0, "marker"), false);
  assert.throws(
    () => config.checkObservable(check, 1, "marker"),
    /already present/,
  );
  const marker = { ...check, expected: "{{marker}}" };
  assert.equal(config.expectedValue(marker, "unique-marker"), "unique-marker");
  assert.equal(
    config.checkPassed(marker, "old", "unique-marker", "unique-marker"),
    true,
  );
});
test("write-capable SQL, stacked statements and unbound parameters are rejected", () => {
  for (const query of [
    "DELETE FROM tasks",
    "SELECT 1; DELETE FROM tasks",
    "WITH x AS (DELETE FROM tasks RETURNING id) SELECT count(*) FROM x",
    "SELECT set_config('transaction_read_only','off',true)",
    "SELECT nextval('tasks_id_seq')",
    "SELECT pg_read_file('/private')",
    "SELECT * FROM tasks WHERE id=$2",
  ])
    assert.throws(() => config.checkedQuery(query));
  assert.equal(
    config.checkedQuery("SELECT ';' AS value;"),
    "SELECT ';' AS value",
  );
  assert.throws(
    () =>
      config.parseDatabaseChecks([{ ...valid(), instructions: "Click Save." }]),
    /Include/,
  );
  assert.throws(
    () =>
      config.parseDatabaseChecks([
        { ...valid(), expected: { arbitrary: "object" } },
      ]),
    /JSON/,
  );
});
test("change/increase/decrease assertions require real observable changes", () => {
  const check = {
    ...config.parseDatabaseChecks([valid()])[0],
    operator: "changes",
  };
  assert.equal(config.checkPassed(check, "old", "old", "marker"), false);
  assert.equal(config.checkPassed(check, "old", "new", "marker"), true);
  assert.equal(
    config.checkPassed({ ...check, operator: "increases" }, 1, 2, "marker"),
    true,
  );
  assert.equal(
    config.checkPassed({ ...check, operator: "decreases" }, 1, 0, "marker"),
    true,
  );
  assert.throws(
    () =>
      config.checkObservable(
        { ...check, operator: "increases" },
        "not numeric",
        "marker",
      ),
    /number/,
  );
});

function readerModule({
  addresses = [{ address: "34.120.1.1", family: 4 }],
  rows = [{ payload: '{"value":0}' }],
  queryError = null,
} = {}) {
  const calls = [],
    clients = [];
  class Client {
    constructor(options) {
      this.options = options;
      this.closed = false;
      clients.push(this);
    }
    on() {}
    async connect() {}
    async end() {
      this.closed = true;
    }
    async query(query) {
      calls.push(query);
      if (typeof query === "object") {
        if (queryError) throw queryError;
        return { rows };
      }
      return { rows: [] };
    }
  }
  return {
    ...load("lib/postgres-verification.ts", {
      pg: { Client },
      "node:dns/promises": { lookup: async () => addresses },
      "@/lib/database-check-config": config,
    }),
    calls,
    clients,
  };
}
const uri =
  "postgresql://readonly:private-password@db.example.test/database?sslmode=require";
test("hosted PostgreSQL inputs require TLS and public pinned addresses", async () => {
  const pg = readerModule();
  assert.equal(pg.parsePostgresUrl(uri).database, "database");
  for (const address of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.1.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.1.1",
    "0.0.0.0",
    "::1",
    "fe80::1",
    "fc00::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
    "2001:0db8::1",
    "2001::1",
    "2002:7f00:1::",
  ])
    assert.equal(pg.publicDatabaseAddress(address), false, address);
  assert.equal(pg.publicDatabaseAddress("34.120.1.1"), true);
  assert.equal(pg.publicDatabaseAddress("2600:1f18:abcd::1"), true);
  for (const raw of [
    "postgresql://user:pass@localhost/db",
    "postgresql://user:pass@127.0.0.1/db",
    uri.replace("sslmode=require", "sslmode=disable"),
    uri + "&options=unsafe",
  ])
    assert.throws(() => pg.parsePostgresUrl(raw));
  const blocked = readerModule({
    addresses: [{ address: "10.0.0.1", family: 4 }],
  });
  await assert.rejects(blocked.postgresReader(uri), /Private/);
  assert.equal(blocked.clients.length, 0);
});
test("reads use a read-only transaction, parameter binding, bounded output and verified TLS", async () => {
  const pg = readerModule();
  const reader = await pg.postgresReader(uri);
  assert.equal(await reader.read(valid().query, "run-marker"), 0);
  await reader.close();
  assert.equal(pg.clients[0].options.host, "34.120.1.1");
  assert.equal(pg.clients[0].options.ssl.servername, "db.example.test");
  assert.equal(pg.clients[0].options.ssl.rejectUnauthorized, true);
  assert.equal(pg.clients[0].closed, true);
  assert.equal(pg.calls[0], "BEGIN READ ONLY");
  const query = pg.calls.find((value) => typeof value === "object");
  assert.deepEqual(query.values, ["run-marker"]);
  assert.match(query.text, /LIMIT 2/);
  assert.match(query.text, /4097/);
  assert.ok(pg.calls.includes("COMMIT"));
});
test("query errors and invalid result shapes are setup errors without private values", async () => {
  for (const rows of [
    [],
    [{ payload: '{"a":1}' }, { payload: '{"a":2}' }],
    [{ payload: '{"a":1,"b":2}' }],
    [{ payload: '{"a":{"private":"row"}}' }],
  ]) {
    const pg = readerModule({ rows });
    const reader = await pg.postgresReader(uri);
    await assert.rejects(
      reader.read(valid().query, "marker"),
      config.DatabaseCheckError,
    );
    await reader.close();
  }
  const pg = readerModule({
    queryError: new Error("private-password and secret database row"),
  });
  const reader = await pg.postgresReader(uri);
  await assert.rejects(
    reader.read(valid().query, "marker"),
    (error) =>
      error instanceof config.DatabaseCheckError &&
      !error.message.includes("private-password"),
  );
  assert.ok(pg.calls.includes("ROLLBACK"));
  await reader.close();
});

test("database verification distinguishes no write from a setup failure and never returns row values", async () => {
  const [check] = config.parseDatabaseChecks([valid()]);
  const records = [];
  let values = [0, 0, 1];
  const verifier = load("lib/database-verification.ts", {
    "@/lib/database-check-config": config,
    "@/lib/database-connections": {
      runDatabaseConfig: async () => ({
        connectionString: uri,
        checks: [check],
      }),
    },
    "@/lib/postgres-verification": {
      postgresReader: async () => ({
        read: async () => values.shift(),
        close: async () => {},
      }),
    },
    "@/lib/db": {
      getSql:
        () =>
        async (parts, ...args) => {
          records.push({ sql: parts.join("?"), args });
          return [];
        },
    },
    "node:timers/promises": { setTimeout: async () => {} },
  });
  const instance = await verifier.runDatabaseVerifier(1, check.id),
    before = await instance.before();
  const result = await instance.after(before);
  assert.equal(result.passed, true);
  assert.ok(!JSON.stringify(result).includes("private-password"));
  assert.ok(records.some((record) => record.args.includes("passed")));
  values = [1];
  await assert.rejects(instance.before(), /already present/);
  await instance.close();
});
test("saving a connection requires project ownership before contacting a customer database", async () => {
  let contacted = false;
  const db = load("lib/database-connections.ts", {
    "@/lib/db": {},
    "@/lib/schema": { getProject: async () => null },
    "@/lib/auth-profile-state": {},
    "@/lib/database-check-config": config,
    "@/lib/postgres-verification": {
      postgresReader: async () => {
        contacted = true;
      },
    },
  });
  await assert.rejects(
    db.saveProjectDatabase(12, "other", {
      origin: "https://app.test",
      connectionString: uri,
      checks: [valid()],
    }),
    /unavailable/,
  );
  assert.equal(contacted, false);
});
test("run setup snapshots database checks without adding credentials or SQL to the task payload", async () => {
  let stored, triggered;
  const database = {
    snapshot: {
      id: 3,
      origin: "https://app.test",
      encryptedConfig: "encrypted-only",
    },
    checks: [{ id: "check-id", title: "Task is saved", buttonLabel: "Save" }],
  };
  const { POST } = load("app/api/projects/[id]/runs/route.ts", {
    "@/auth": { auth: async () => ({ user: { githubId: "100" } }) },
    "@/lib/database-connections": { databaseForRun: async () => database },
    "@/lib/database-check-config": config,
    "@/lib/auth-profiles": {},
    "@/lib/auth-profile-state": {},
    "@/lib/github-credentials": {},
    "@/lib/trigger-client": {
      getTriggerClientConfig: () => ({}),
      swarmStartError: () => "worker error",
    },
    "@/lib/github": {},
    "@/lib/run-targets": {},
    "@/lib/schema": {
      getProject: async () => ({ id: 1, app_url: "https://app.test" }),
      createRun: async (...args) => {
        stored = args;
        return { id: 12 };
      },
    },
    "@trigger.dev/sdk": {
      tasks: {
        trigger: async (...args) => {
          triggered = args;
        },
      },
    },
  });
  const response = await POST(
    new Request("https://preflight.test/api/projects/1/runs", {
      method: "POST",
      headers: {
        origin: "https://preflight.test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ verifyDatabase: true }),
    }),
    { params: Promise.resolve({ id: "1" }) },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(stored[2].database, database);
  assert.deepEqual(triggered[1], { runId: 12, targetUrl: "https://app.test" });
});

test("database setup fails before browser allocation, and confirmed automatic actions skip only the redundant fallback", async () => {
  for (const [fail, alreadyVerified] of [
    [true, false],
    [false, false],
    [false, true],
  ]) {
    let batches = 0,
      inFlight = 0,
      maxInFlight = 0;
    const payloads = [],
      statuses = [];
    const task = load("src/trigger/run-swarm.ts", {
      "@/lib/run-details": load("lib/run-details.ts", {}),
      "@/lib/run-authentication": { renewRunAuthentication: async () => false },
      "@/lib/automatic-database": {
        preflightAutomaticDatabase: async () => true,
      },
      "@/lib/auth-profiles": {},
      "@/lib/model-config": { assertSwarmModelConfig: () => {} },
      "@/lib/db": {
        getSql:
          () =>
          async (parts, ...values) => {
            const query = parts.join("");
            if (
              query.includes("FROM run_database_checks") &&
              !query.includes("COUNT")
            ) {
              assert.equal(batches, 1);
              assert.deepEqual(values, [1]);
              assert.match(query, /status='passed'/);
              assert.match(query, /check_id LIKE 'auto-%'/);
              return alreadyVerified
                ? [{ check_id: "auto-1-0-0-abcdef01" }]
                : [];
            }
            return /COUNT/.test(query)
              ? [{ c: 0 }]
              : [
                  {
                    id: 1,
                    status: "queued",
                    plan: [{ id: "home", title: "Home", detail: "Check home" }],
                    target_url: "https://app.test",
                    database_snapshot: { id: 3 },
                  },
                ];
          },
      },
      "@/lib/schema": {
        updateRunStatus: async (_id, status) => statuses.push(status),
        recordTestResult: async () => {},
      },
      "@/lib/database-verification": {
        preflightRunDatabase: async () => {
          if (fail) throw new Error("Database connection unavailable");
          return [1, 2].map((id) => ({
            id: String(id),
            title: "Save test data",
            buttonLabel: "Save",
            instructions: "Fill a unique marker and save.",
          }));
        },
        databaseVerificationError: async () => {},
      },
      "@trigger.dev/sdk": {
        task: (config) => config,
        tasks: {
          batchTriggerAndWait: async () => {
            batches++;
            return { runs: [{ ok: true }] };
          },
          triggerAndWait: async (_id, payload) => {
            payloads.push(payload);
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise((resolve) => setTimeout(resolve, 1));
            inFlight--;
            return { ok: true };
          },
        },
      },
    }).runSwarm;
    if (fail) {
      await assert.rejects(task.run({ runId: 1 }), /Database connection/);
      assert.equal(batches, 0);
      assert.deepEqual(statuses, ["failed"]);
    } else {
      await task.run({ runId: 1 });
      assert.equal(batches, 1);
      assert.equal(payloads.length, alreadyVerified ? 2 : 3);
      if (!alreadyVerified) {
        assert.equal(payloads[0].verifyDatabase, true);
        assert.equal(
          payloads[0].assignment.steps[0].id,
          "automatic-database-create",
        );
      } else
        assert.ok(
          payloads.every(
            (p) => p.assignment.steps[0].id !== "automatic-database-create",
          ),
        );
      assert.equal(maxInFlight, 1);
      assert.ok(
        payloads
          .slice(alreadyVerified ? 0 : 1)
          .every((payload) => payload.assignment.steps[0].databaseCheckId),
      );
      assert.ok(!JSON.stringify(payloads).includes("postgresql://"));
      assert.equal(statuses.at(-1), "done");
    }
  }
});

test("database settings enforce request origin and ownership before touching a customer connection", async () => {
  const { NextRequest } = require("next/server");
  for (const [signedIn, owns, origin, status] of [
    [false, false, "https://preflight.test", 404],
    [true, false, "https://preflight.test", 404],
    [true, true, "https://other.test", 403],
    [true, true, "https://preflight.test", 200],
  ]) {
    const saved = [];
    const route = load("app/api/projects/[id]/database/route.ts", {
      "@/auth": {
        auth: async () => (signedIn ? { user: { githubId: "100" } } : null),
      },
      "next/cache": { revalidatePath: () => {} },
      "@/lib/schema": { getProject: async () => (owns ? { id: 1 } : null) },
      "@/lib/database-check-config": config,
      "@/lib/auth-profile-state": { ProfileError: class extends Error {} },
      "@/lib/database-connections": {
        saveProjectDatabase: async (...args) => {
          saved.push(args);
          return { id: 3, origin: "https://app.test", check_count: 1 };
        },
      },
    });
    const response = await route.POST(
      new NextRequest("https://preflight.test/api/projects/1/database", {
        method: "POST",
        headers: { origin, "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: "https://app.test",
          connectionString: uri,
          checks: [valid()],
        }),
      }),
      { params: Promise.resolve({ id: "1" }) },
    );
    assert.equal(response.status, status);
    assert.equal(saved.length, status === 200 ? 1 : 0);
    if (status === 200) {
      assert.deepEqual(saved[0].slice(0, 2), [1, "100"]);
      assert.ok(
        !JSON.stringify(await response.json()).includes("private-password"),
      );
    }
  }
});

test("locked database connections return a specific startup error before creating or triggering a run", async () => {
  let created = 0;
  const { POST } = load("app/api/projects/[id]/runs/route.ts", {
    "@/auth": { auth: async () => ({ user: { githubId: "100" } }) },
    "@/lib/database-connections": {
      databaseForRun: async () => {
        throw new config.DatabaseConnectionLocked(
          "Could not unlock the database connection.",
        );
      },
    },
    "@/lib/database-check-config": config,
    "@/lib/auth-profiles": {},
    "@/lib/auth-profile-state": {},
    "@/lib/github-credentials": {},
    "@/lib/github": {},
    "@/lib/run-targets": {},
    "@/lib/trigger-client": { getTriggerClientConfig: () => ({}) },
    "@/lib/schema": {
      getProject: async () => ({ id: 7, app_url: "https://app.test" }),
      createRun: async () => {
        created++;
      },
    },
    "@trigger.dev/sdk": {
      tasks: {
        trigger: async () => {
          created++;
        },
      },
    },
  });
  const response = await POST(
    new Request("https://preflight.test/api/projects/7/runs", {
      method: "POST",
      headers: { origin: "https://preflight.test" },
      body: JSON.stringify({ verifyDatabase: true }),
    }),
    { params: Promise.resolve({ id: "7" }) },
  );
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "DATABASE_CONNECTION_LOCKED");
  assert.equal(created, 0);
});

test("worker encryption setup failures are persisted even when a run has no advanced checks", async () => {
  const statements = [];
  const api = load("lib/database-verification.ts", {
    "@/lib/db": {
      getSql:
        () =>
        async (parts, ...values) => {
          statements.push({ q: parts.join("?"), values });
          return [];
        },
    },
    "@/lib/database-connections": {
      runDatabaseConfig: async () => {
        throw new config.DatabaseCheckError("Shared encryption key differs.");
      },
    },
    "@/lib/postgres-verification": {},
    "@/lib/database-check-config": config,
  });
  await assert.rejects(
    api.preflightRunDatabase(12),
    /Shared encryption key differs/,
  );
  assert.ok(
    statements.some(
      (s) =>
        s.q.includes("INSERT INTO run_database_checks") &&
        s.values.includes("Shared encryption key differs."),
    ),
  );
});

test("workers distinguish a mismatched snapshot key from a stale saved connection", async (t) => {
  const previous = process.env.PROFILE_ENCRYPTION_KEY;
  process.env.PROFILE_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString("base64");
  t.after(() => {
    if (previous === undefined) delete process.env.PROFILE_ENCRYPTION_KEY;
    else process.env.PROFILE_ENCRYPTION_KEY = previous;
  });
  const state = load("lib/auth-profile-state.ts", {});
  const api = load("lib/database-connections.ts", {
    "@/lib/db": {
      getSql: () => async () => [
        {
          database_snapshot: {
            id: 1,
            origin: "https://app.test",
            encryptedConfig: "unreadable",
            encryptionKeyId: "a-different-deployment-key",
          },
          status: "running",
          project_id: 7,
          target_url: "https://app.test",
          owner_github_id: "100",
          connection_id: 1,
          revoked_at: null,
        },
      ],
    },
    "@/lib/schema": {},
    "@/lib/auth-profile-state": state,
    "@/lib/database-check-config": config,
    "@/lib/postgres-verification": {},
  });
  await assert.rejects(
    api.runDatabaseConfig(12),
    /different PROFILE_ENCRYPTION_KEY/,
  );
});
