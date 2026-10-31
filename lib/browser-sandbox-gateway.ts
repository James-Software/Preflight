/** Trusted CDP bridge. The disposable VM receives only an ephemeral bridge token. */
export const BROWSER_SANDBOX_GATEWAY = String.raw`
const { chromium } = require('/vercel/sandbox/browser/node_modules/playwright-core');
const { WebSocketServer, WebSocket } = require('/vercel/sandbox/browser/node_modules/ws');
const { spawn } = require('node:child_process');
const { timingSafeEqual } = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const expected = Buffer.from(process.env.PREFLIGHT_BROWSER_TOKEN || '');
if (expected.length < 32) process.exit(1);
const browser = spawn(chromium.executablePath(), ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--remote-debugging-port=9222','--remote-debugging-address=127.0.0.1','--user-data-dir=/tmp/preflight-browser-profile','about:blank'], { stdio:'ignore', env: { PATH:process.env.PATH, HOME:'/tmp', PLAYWRIGHT_BROWSERS_PATH:process.env.PLAYWRIGHT_BROWSERS_PATH } });
browser.on('exit', () => process.exit(1));
function authorized(req) {
  const supplied = Buffer.from(String(req.headers['x-preflight-browser-token'] || ''));
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
(async () => {
  let endpoint;
  for (let i=0;i<100;i++) {
    try { endpoint = (await (await fetch('http://127.0.0.1:9222/json/version')).json()).webSocketDebuggerUrl; break; } catch { await new Promise(r=>setTimeout(r,100)); }
  }
  if (!endpoint) process.exit(1);
  const server = http.createServer((req,res) => { res.writeHead(authorized(req) ? 200 : 401); res.end(); });
  const sockets = new WebSocketServer({ noServer:true, maxPayload:16*1024*1024, perMessageDeflate:false });
  server.on('upgrade',(req,socket,head) => {
    if (!authorized(req) || req.url !== '/cdp') { socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); return; }
    sockets.handleUpgrade(req,socket,head,client => {
      const upstream = new WebSocket(endpoint, { maxPayload:16*1024*1024, perMessageDeflate:false });
      let queue=[], bytes=0;
      client.on('message',(data,binary) => {
        if (upstream.readyState === WebSocket.OPEN) upstream.send(data,{binary});
        else { bytes+=data.length; if(bytes>16*1024*1024) {client.terminate();upstream.terminate();} else queue.push([data,binary]); }
      });
      upstream.on('open',()=>{ for (const [data,binary] of queue) upstream.send(data,{binary}); queue=[]; });
      upstream.on('message',(data,binary)=>{ if(client.readyState===WebSocket.OPEN) client.send(data,{binary}); });
      client.on('close',()=>upstream.close()); upstream.on('close',()=>client.close());
      client.on('error',()=>upstream.terminate()); upstream.on('error',()=>client.terminate());
    });
  });
  server.listen(9223,'0.0.0.0',()=>fs.writeFileSync('/tmp/preflight-browser-ready','ready'));
})();
`;
