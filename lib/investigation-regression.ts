import { Sandbox } from "@vercel/sandbox";
import * as ts from "typescript";
import { investigationSourcePath } from "@/lib/check-investigation";

export type RegressionResult = { exitCode: number; output: string; loadedPaths: string[] };

// Repository code and generated tests execute only inside the disposable VM.
// No npm hooks, credentials, app connections, or network access enter it.
export const REGRESSION_HARNESS = `const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path').posix;
const modules = require('./modules.json');
const loaded = new Set();
function loadSource(file, mocks = {}) {
  if (!Object.hasOwn(modules, file)) throw new Error('Source unavailable: ' + file);
  loaded.add(file);
  fs.writeFileSync(__dirname+'/loaded.json', JSON.stringify([...loaded]));
  const module = { exports: {} };
  const localRequire = name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith('node:')) return require(name);
    const target = name.startsWith('@/') ? name.slice(2) : name.startsWith('.') ? path.join(path.dirname(file), name) : null;
    if (target) for (const candidate of [target, target+'.ts', target+'.tsx', target+'.js', target+'/index.ts', target+'/index.js']) {
      if (Object.hasOwn(modules, candidate)) return loadSource(candidate, mocks);
    }
    throw new Error('Missing dependency; supply a boundary fixture: ' + name);
  };
  vm.runInThisContext('(function(exports,require,module){'+modules[file]+'\\n})', { filename: file })(module.exports, localRequire, module);
  return module.exports;
}
module.exports = { loadSource };`;

export async function executeRegression(files: Record<string, string>, test: string): Promise<RegressionResult> {
  if (typeof test !== "string" || !test.trim() || test.length > 24000 ||
    !Object.keys(files).length || Object.keys(files).length > 6 ||
    Object.entries(files).some(([path, source]) => !investigationSourcePath(path) || typeof source !== "string"))
    throw new Error("Invalid regression test input.");
  const modules: Record<string, string> = {};
  for (const [path, source] of Object.entries(files)) {
    if (!/\.[cm]?[jt]sx?$/.test(path)) continue;
    modules[path] = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
    }, fileName: path }).outputText;
  }
  if (!Object.keys(modules).length) throw new Error("No supported executable source was selected.");
  const sandbox = await Sandbox.create({
    image: "vercel/sandbox/node:24", persistent: false, timeout: 90_000, resources: { vcpus: 1 }, networkPolicy: "deny-all",
  });
  try {
    await sandbox.writeFiles([
      { path: "modules.json", content: Buffer.from(JSON.stringify(modules)) },
      { path: "harness.cjs", content: Buffer.from(REGRESSION_HARNESS) },
      { path: "regression.test.cjs", content: Buffer.from(test) },
    ]);
    const result = await sandbox.runCommand({ cmd: "node", args: ["--test", "--test-reporter=tap", "regression.test.cjs"], cwd: "/vercel/sandbox" });
    const output = ((await result.stdout()) + "\n" + (await result.stderr())).slice(0, 24000);
    const loaded = await sandbox.readFileToBuffer({ path: "loaded.json" });
    const paths = loaded ? JSON.parse(loaded.toString("utf8")) : [];
    return { exitCode: result.exitCode, output, loadedPaths: Array.isArray(paths) ? paths.filter(p => typeof p === "string" && Object.hasOwn(modules, p)) : [] };
  } finally { await sandbox.stop(); }
}
