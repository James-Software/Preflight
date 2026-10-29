const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./load-module.cjs');
function engine({ output, exitCode = 0, outcome = 'expected', loadedPaths = ['lib/feature.ts'], active = true }) {
  let executions = 0;
  const model = async (system) => {
    if (system.startsWith('Write')) return { test: 'test code', targetPaths: ['lib/feature.ts'] };
    if (system.startsWith('Independently audit')) return { outcome: 'expected', confidence: .99, summary: 'Valid target test.' };
    return { outcome, confidence: .99, summary: 'The exported behavior was executed.' };
  };
  const api = load('lib/autonomous-regression.ts', { '@/lib/models': { fixModelJson: model } });
  return { run: () => api.verifySourceRegression({ files: { 'lib/feature.ts': 'export const value=1;' }, sha: 'a'.repeat(40), evidence: 'Expected value',
    active: async () => active, execute: async () => { executions++; return { output, exitCode, loadedPaths }; } }), executions: () => executions };
}
test('a regression can resolve expected source behavior only with executed control and target', async () => {
  const e = engine({ output: 'ok 1 - control\nok 2 - regression\n' });
  assert.equal((await e.run()).outcome, 'expected');
  assert.equal(e.executions(), 1);
});
test('a code defect requires a passing control and a genuine regression assertion failure', async () => {
  const e = engine({ output: "ok 1 - control\nnot ok 2 - regression\ncode: 'ERR_ASSERTION'", outcome: 'bug', exitCode: 1 });
  assert.equal((await e.run()).outcome, 'bug');
});
test('failed controls, skipped tests and dependency crashes never confirm a defect', async () => {
  for (const output of [
    "not ok 1 - control\nnot ok 2 - regression\nERR_ASSERTION",
    "ok 1 - control # SKIP\nnot ok 2 - regression\nERR_ASSERTION",
    "ok 1 - control\nnot ok 2 - regression\nMODULE_NOT_FOUND",
  ]) {
    assert.equal((await engine({ output, outcome: 'bug', exitCode: 1 }).run()).outcome, 'unresolved');
  }
});
test('an unexecuted target or cancelled grant cannot produce a source verdict', async () => {
  assert.equal(await engine({ output: 'ok 1 - control\nok 2 - regression', loadedPaths: [] }).run(), null);
  const e = engine({ active: false });
  assert.equal(await e.run(), null);
  assert.equal(e.executions(), 0);
});
test('sandbox setup never receives production secrets or network access and always stops', async () => {
  let stopped = false;
  const api = load('lib/investigation-regression.ts', {
    '@/lib/check-investigation': { investigationSourcePath: p => p === 'lib/feature.ts' },
    '@vercel/sandbox': { Sandbox: { create: async options => {
      assert.equal(options.networkPolicy, 'deny-all');
      assert.equal(options.persistent, false);
      assert.equal(options.env, undefined);
      assert.ok(options.timeout <= 90000);
      return { writeFiles: async files => {
        assert.equal(files.length, 3);
        assert.ok(files.every(file => file.path.startsWith("/vercel/sandbox/")));
        assert.match(files[0].content.toString(), /feature.ts/);
      }, runCommand: async () => { throw new Error('VM timed out'); }, stop: async () => { stopped = true; } };
    } } },
  });
  await assert.rejects(api.executeRegression({ 'lib/feature.ts': 'export const value=1;' }, 'test'), /VM timed out/);
  assert.equal(stopped, true);
});
test('the uploaded harness executes actual transpiled source and retains its assertion failure', async (t) => {
  const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
  const { promisify } = require('node:util');
  const execFile = promisify(require('node:child_process').execFile);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'source-regression-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const api = load('lib/investigation-regression.ts', {
    '@/lib/check-investigation': { investigationSourcePath: () => true },
    '@vercel/sandbox': { Sandbox: { create: async () => ({
      writeFiles: async files => { for (const file of files) await fs.writeFile(path.join(dir, path.basename(file.path)), file.content); },
      runCommand: async command => {
        let result;
        const testEnv = { ...process.env }; delete testEnv.NODE_TEST_CONTEXT;
        try { result = { ...await execFile(command.cmd, command.args, { cwd: dir, env: testEnv }), code: 0 }; }
        catch (error) { result = error; }
        return { exitCode: result.code, stdout: async () => result.stdout, stderr: async () => result.stderr };
      },
      readFileToBuffer: async ({ path: file }) => fs.readFile(path.join(dir, path.basename(file))).catch(() => null), stop: async () => {},
    }) } },
  });
  const result = await api.executeRegression({ 'lib/feature.ts': 'export function double(value: number) { return value * 3; }' }, `
    const {test}=require('node:test'); const assert=require('node:assert/strict');
    const {loadSource}=require('./harness.cjs'); const {double}=loadSource('lib/feature.ts');
    test('control',()=>assert.equal(double(0),0));
    test('regression',()=>assert.equal(double(2),4));
  `);
  assert.equal(result.exitCode, 1);
  assert.match(result.output, /^ok \d+ - control/m);
  assert.match(result.output, /^not ok \d+ - regression/m);
  assert.match(result.output, /ERR_ASSERTION/);
  assert.deepEqual(result.loadedPaths, ['lib/feature.ts']);
});
test('source results remain visibly separate from deployed browser confirmation', () => {
  const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
  const Results = load('components/TestStepResults.tsx', {}).default;
  const html = renderToStaticMarkup(React.createElement(Results, { results: [{
    step_id: 'feature', title: 'Feature check', status: 'code_confirmed', summary: 'Source defect.',
    investigation: { state: 'completed', retest_status: 'code_confirmed', regression: {
      summary: 'An executed assertion failed.', test: 'assert.equal(actual, expected)', output: 'not ok 2 - regression', outcome: 'bug', exitCode: 1, loadedPaths: ['lib/feature.ts'],
    } },
  }] }));
  assert.match(html, /Bug reproduced in source test/);
  assert.match(html, /repository code; deployed browser behavior is separate/);
  assert.match(html, /not ok 2 - regression/);
  assert.match(html, /0 reproduced failures/);
  assert.doesNotMatch(html, /checks need follow-up/);
});
