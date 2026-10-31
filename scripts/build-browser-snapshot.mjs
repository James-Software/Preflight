import { Sandbox } from '@vercel/sandbox';
// Run with normal Vercel OIDC/CLI credentials. Never copy app secrets into this VM.
const sandbox = await Sandbox.create({image:'vercel/sandbox/node:24',persistent:false,timeout:1200000,resources:{vcpus:1}});
try {
  const setup = await sandbox.runCommand({cmd:'bash',args:['-lc', 'mkdir -p /vercel/sandbox/browser && cd /vercel/sandbox/browser && npm init -y >/dev/null && npm install playwright-core@1.64.0 ws@8.22.1 && PLAYWRIGHT_BROWSERS_PATH=/vercel/sandbox/browsers npx playwright-core install --with-deps chromium'],sudo:true,timeoutMs:600000});
  if(setup.exitCode!==0) throw new Error('Trusted browser installation failed.');
  await sandbox.updateNetworkPolicy('deny-all');
  const snapshot = await sandbox.snapshot({expiration:0});
  console.log(`Set SANDBOX_BROWSER_SNAPSHOT_ID to ${snapshot.snapshotId} on the web deployment.`);
} finally { await sandbox.stop().catch(()=>{}); }
