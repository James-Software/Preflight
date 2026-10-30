const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// Transpile isolated server modules so tests can supply session/DB boundaries
// without credentials, a network connection, or a running Next server.
function load(relative, mocks) {
  const filename = path.join(__dirname, "..", relative);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith("@/")) {
      const relative = name.slice(2);
      for (const extension of [".ts", ".tsx"]) {
        if (fs.existsSync(path.join(__dirname, "..", relative + extension))) return load(relative + extension, mocks);
      }
    }
    return require(name);
  };
  vm.runInThisContext(`(function(exports,require,module){${code}\n})`, {
    filename,
  })(module.exports, localRequire, module);
  return module.exports;
}

module.exports = { load };
