const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./load-module.cjs');
test('legacy recovery queues only unarchived partial reports with unresolved checks', async () => {
  const calls = [];
  const api = load('lib/verification-recovery.ts', {
    '@trigger.dev/sdk': { tasks: { trigger: async (...args) => calls.push(args) } },
    '@/lib/trigger-client': { getTriggerClientConfig: () => ({ accessToken: 'test-only', previewBranch: '' }) },
  });
  const run = { id: 24, project_id: 7, status: 'partial', verification_version: 0 };
  assert.equal(await api.recoverLegacyVerification(run, [{ status: 'inconclusive' }]), true);
  assert.deepEqual(calls[0][1], { runId: 24, projectId: 7 });
  assert.equal(calls[0][2].idempotencyKey, 'recover-verification-v2:24');
  for (const change of [{ status: 'cancelled' }, { status: 'done' }, { archived_at: '2026-10-29' }, { verification_version: 2 }])
    assert.equal(await api.recoverLegacyVerification({ ...run, ...change }, [{ status: 'inconclusive' }]), false);
  assert.equal(await api.recoverLegacyVerification(run, [{ status: 'passed' }]), false);
  assert.equal(calls.length, 1);
});
test('production sweep queues legacy reports without page views using the same idempotency', async () => {
  const calls = [];
  const scheduled = load('src/trigger/recover-run-verification.ts', {
    '@/lib/db': { getSql: () => async query => {
      const sql = query.join('?');
      assert.match(sql, /archived_at IS NULL/);
      assert.match(sql, /verification_version<2/);
      assert.match(sql, /LIMIT 5/);
      return [{ id: 24, project_id: 7 }];
    } },
    '@/lib/schema': { ensureSchema: async () => {} }, '@/lib/run-authentication': {},
    '@trigger.dev/sdk': { task: x => x, schedules: { task: x => x }, tasks: { trigger: async (...args) => calls.push(args) } },
  }).recoverPendingVerifications;
  assert.deepEqual(scheduled.cron.environments, ['PRODUCTION']);
  assert.equal((await scheduled.run()).queued, 1);
  assert.equal(calls[0][0], 'recover-run-verification');
  assert.deepEqual(calls[0][1], { runId: 24, projectId: 7 });
  assert.equal(calls[0][2].idempotencyKey, 'recover-verification-v2:24');
});
