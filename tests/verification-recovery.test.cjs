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
