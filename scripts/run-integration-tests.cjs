const { spawnSync } = require('node:child_process');
const files = [
  'guest-demo', 'persistence-contract', 'browser-security', 'private-evidence',
  'automatic-database', 'automatic-persistence', 'check-investigation', 'test-user-issuer',
  'project-collaboration', 'project-deletion', 'project-deletion-ui', 'run-mcp',
];
for (const name of files) {
  process.stdout.write(`\nIntegration: ${name}\n`);
  const result = spawnSync(process.execPath, [`tests/${name}.integration.cjs`], { stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
}
