const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./load-module.cjs');
const mocks={'@/lib/auth-profile-state':{profileKey:()=>Buffer.alloc(32,7)}};
const client=load('lib/browser-sandbox-client.ts',mocks);
test('isolated browser grants reject tampering, expired timestamps and malformed run scope',()=>{
 const input={action:'create',runId:3,id:require('node:crypto').randomUUID(),timestamp:Date.now()};
 const body=JSON.stringify(input),signature=client.signBrowserRequest(body);
 assert.equal(client.validBrowserRequest(body,signature),true);
 assert.equal(client.validBrowserRequest(body+' ',signature),false);
 assert.equal(client.validBrowserRequest(body,'0'.repeat(64)),false);
 assert.equal(client.parseBrowserRequest(body).runId,3);
 for(const change of [{runId:0},{id:'../escape'},{timestamp:Date.now()-61000},{action:'resume'}]) assert.throws(()=>client.parseBrowserRequest(JSON.stringify({...input,...change})));
});
test('browser allocation uses isolated fallback only for supported capacity failures on a scoped non-interactive run',async()=>{
 const original=global.fetch;process.env.BROWSERBASE_API_KEY='fixture';let fallback=0;
 const browser=load('lib/browserbase.ts',{'@/lib/browser-sandbox-client':{createSandboxBrowser:async id=>{fallback++;assert.equal(id,3);return{id:'isolated'}},closeSandboxBrowser:async()=>{}}});
 try{
  for(const status of [402,429,503]) {global.fetch=async()=>new Response('',{status});assert.equal((await browser.createBrowserSession(false,false,600,{runId:3})).id,'isolated');}
  assert.equal(fallback,3);
  global.fetch=async()=>new Response('',{status:402});
  await assert.rejects(browser.createBrowserSession(false,true,600,{runId:3}));
  await assert.rejects(browser.createBrowserSession());
  global.fetch=async()=>new Response('',{status:401});await assert.rejects(browser.createBrowserSession(false,false,600,{runId:3}));
  assert.equal(fallback,3);
 }finally{global.fetch=original;}
});
test('cancelled allocation stops its VM and cannot return a CDP credential',async()=>{
 let stopped=0,queries=0;
 process.env.SANDBOX_BROWSER_SNAPSHOT_ID='fixture';
 const route=load('app/api/internal/browser-sandbox/route.ts',{
  ...mocks,'@/lib/browser-runtime-image':{browserRuntimeImage:async id=>id},'@/lib/schema':{ensureSchema:async()=>{}},'@/lib/db':{getSql:()=>async()=>++queries===1?[{id:'reserved'}]:[]},
  '@vercel/sandbox':{Sandbox:{create:async()=>({name:'fixture',writeFiles:async()=>{},runCommand:async()=>({exitCode:0}),stop:async()=>{stopped++},domain:()=>{throw Error('must not return endpoint')}})}}
 });
 const body=JSON.stringify({action:'create',runId:3,id:require('node:crypto').randomUUID(),timestamp:Date.now()});
 const response=await route.POST(new Request('https://preflight.test/api/internal/browser-sandbox',{method:'POST',headers:{'x-preflight-browser':client.signBrowserRequest(body)},body}));
 assert.equal(response.status,503);assert.equal(stopped,1);assert.ok(!JSON.stringify(await response.json()).includes('token'));
});
