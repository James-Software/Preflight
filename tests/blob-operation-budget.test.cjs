const assert = require("node:assert/strict");
const { test } = require("node:test");
const { load } = require("./load-module.cjs");

test("30 days of scheduled work makes zero Blob requests by default", async () => {
  const previous = process.env.ENABLE_LEGACY_BLOB_MIGRATION;
  let blobCalls = 0, databaseCleanups = 0;
  const unexpectedBlob = async () => { blobCalls++; throw new Error("Blob quota exhausted"); };
  const retention = load("lib/screenshot-retention.ts", {
    "@vercel/blob": { list: unexpectedBlob, get: unexpectedBlob, del: unexpectedBlob },
    "@/lib/db": { getSql: () => { throw new Error("Paused migration must not query DB"); } },
    "@/lib/schema": { ensureSchema: async () => { throw new Error("Paused migration must not initialize DB"); } },
    "@/lib/evidence": {}, "@/lib/site": { SITE_URL: "https://preflight.example" },
  });
  const tasks = load("src/trigger/cleanup-screenshots.ts", {
    "@trigger.dev/sdk": { schedules: { task: config => config } },
    "@/lib/screenshot-retention": {
      privatizeLegacyScreenshots: retention.privatizeLegacyScreenshots,
      expirePrivateScreenshots: async () => { databaseCleanups++; return 2; },
    },
  });
  try {
    delete process.env.ENABLE_LEGACY_BLOB_MIGRATION;
    assert.equal(tasks.privatizeScreenshots.cron.pattern, "0 10 * * *");
    assert.equal(tasks.privatizeScreenshots.retry.maxAttempts, 1);
    for (let day = 0; day < 30; day++) {
      assert.equal((await tasks.privatizeScreenshots.run()).paused, true);
      assert.deepEqual(await tasks.cleanupScreenshots.run(), { privateDeleted: 2 });
    }
    // Stale five-minute deliveries and manual retries must also fail closed.
    for (let i = 0; i < 288; i++) await tasks.privatizeScreenshots.run();
    for (const value of ["false", "1", "TRUE", ""]) {
      process.env.ENABLE_LEGACY_BLOB_MIGRATION = value;
      assert.equal((await tasks.privatizeScreenshots.run()).paused, true);
    }
    // Daily retention must remain Blob-free even when migration is opted in.
    process.env.ENABLE_LEGACY_BLOB_MIGRATION = "true";
    await tasks.cleanupScreenshots.run();
    assert.equal(blobCalls, 0);
    assert.equal(databaseCleanups, 31);
  } finally {
    if (previous === undefined) delete process.env.ENABLE_LEGACY_BLOB_MIGRATION;
    else process.env.ENABLE_LEGACY_BLOB_MIGRATION = previous;
  }
});
