const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./load-module.cjs');
test('regression route requires a live signed source grant and atomically limits execution', async () => {
  let valid = false, budget = 2, executions = 0, granted = true;
  const route = load('app/api/internal/investigation-regression/route.ts', {
    '@/lib/investigation-source': {
      validInvestigationRequest: () => valid,
      investigationSource: async () => { if (!granted) throw new Error('Grant revoked'); return { sha: 'a'.repeat(40), files: { 'lib/feature.ts': 'export const actual=1;' } }; },
    },
    '@/lib/db': { getSql: () => async () => budget-- > 0 ? [{ run_id: 24 }] : [] },
    '@/lib/investigation-regression': { executeRegression: async (files) => {
      assert.deepEqual(files, { 'lib/feature.ts': 'export const actual=1;' });
      executions++; return { exitCode: 0, output: 'ok 1 - control\nok 2 - regression', loadedPaths: ['lib/feature.ts'] };
    } },
  });
  const request = () => new Request('https://app.test/api/internal/investigation-regression', { method: 'POST', body: JSON.stringify({ runId: 24, agentIndex: 0, stepId: 'feature', token: 'grant', timestamp: Date.now(), sha: 'a'.repeat(40), paths: ['lib/feature.ts'], test: 'controlled test', files: { 'lib/feature.ts': 'FAKE SOURCE' } }) });
  assert.equal((await route.POST(request())).status, 403);
  assert.equal(executions, 0);
  valid = true;
  granted = false;
  assert.equal((await route.POST(request())).status, 409);
  assert.equal(executions, 0);
  granted = true;
  assert.equal((await route.POST(request())).status, 200);
  assert.equal((await route.POST(request())).status, 200);
  assert.equal((await route.POST(request())).status, 409);
  assert.equal(executions, 2);
});
