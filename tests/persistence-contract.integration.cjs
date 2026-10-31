// Real Chromium + PostgreSQL assertions. The driver only selects the initial
// fill/click; confirmation replays production actions and reads actual SQL.
const assert=require('node:assert/strict');
const http=require('node:http');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const {chromium}=require('playwright-core');
const {load}=require('./load-module.cjs');
(async()=>{
 const state=new PGlite(),data=new PGlite();
 const sql=async(parts,...values)=>{let q=parts[0];values.forEach((_,i)=>q+=`$${i+1}`+parts[i+1]);return(await state.query(q,values)).rows;};
 const deps={'@/lib/db':{getSql:()=>sql}};
 const schema=load('lib/schema.ts',deps);deps['@/lib/schema']=schema;
 const config=load('lib/database-check-config.ts',{});
 const check={id:'7f1856bf-e695-4b21-bf37-3259ee51d0c9',title:'Save waitlist email',buttonLabel:'Join the waitlist',successText:'You have entered the waitlist!',query:"SELECT count(*)::int FROM waitlist_entries WHERE email = $1 || '@example.test'",operator:'equals',expected:1};
 const boundary={runDatabaseConfig:async()=>({connectionString:'fixture',checks:[check]})};
 const verification=load('lib/database-verification.ts',{...deps,'@/lib/database-connections':boundary,'@/lib/postgres-verification':{postgresReader:async()=>({read:async(q,marker)=>Object.values((await data.query(q,[marker])).rows[0])[0],close:async()=>{}})}});
 let writes=0,submits=[];
 const app=http.createServer(async(req,res)=>{
  if(req.method==='POST'){
   let body='';for await(const chunk of req)body+=chunk;
   const input=JSON.parse(body);await data.query('INSERT INTO waitlist_entries(email) VALUES($1)',[input.email]);writes++;
   res.setHeader('content-type','application/json');res.end('{"success":true}');return;
  }
  const scenario=req.url.slice(1);
  res.setHeader('content-type','text/html');res.end(`<html><body><form><label for="email">Email address</label><input id="email" name="email" type="email" required><button>Join the waitlist</button></form><div role="status">${scenario==='stale'?'You have entered the waitlist!':''}</div><script>document.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const input=document.querySelector('input');${scenario==='working'?"await fetch('/save',{method:'POST',body:JSON.stringify({email:input.value})});":''}input.value='';document.querySelector('[role=status]').textContent=${scenario==='rejected'?"'Invalid email address'":"'You have entered the waitlist!'"};});</script></body></html>`);
 });
 let browser;
 try{
  await schema.ensureSchema();await data.exec('CREATE TABLE waitlist_entries(id SERIAL PRIMARY KEY,email TEXT UNIQUE NOT NULL)');
  await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({executablePath:require('./browser-fixture.cjs').chromiumPath,args:['--no-sandbox']});
  const origin='https://demo.example',local=`http://127.0.0.1:${app.address().port}`;
  const project=await schema.createProject('owner',origin,'owner/demo');
  const summaries=[];
  for(const scenario of ['broken','working','rejected','stale']){
   const run=await schema.createRun(project.id,origin+'/'+scenario);await schema.updateRunStatus(run.id,'running');
   await sql`INSERT INTO run_database_checks(run_id,check_id,title,button_label,status) VALUES(${run.id},${check.id},${check.title},${check.buttonLabel},'pending')`;
   let decisions=0,contexts=0;
   const worker=load('src/trigger/browser-agent.ts',{
    ...deps,'@trigger.dev/sdk':{task:x=>x},'@/lib/database-verification':verification,'@/lib/automatic-database':{},
    '@/lib/auth-profiles':{},'@/lib/browser-auth':{},'@/lib/database-check-config':config,
    '@/lib/browserbase':{createBrowserSession:async()=>({id:'fixture',connectUrl:'fixture'}),closeBrowserSession:async()=>{}},
    'playwright-core':{chromium:{connectOverCDP:async()=>({newContext:async(...args)=>{contexts++;return browser.newContext(...args);},close:async()=>{}})}},
    'node:timers/promises':{setTimeout:async()=>{}},
    '@/lib/evidence':{uploadScreenshot:async()=>`https://preflight.example/api/runs/${run.id}/screenshots/fixture`},
    '@/lib/model-config':{MODEL_CONFIG:{judge:{provider:'openai-decisions'}}},
    '@/lib/models':{
     driverDecide:async()=>decisions++===0?{action:'fill',role:'textbox',name:'Email address',value:config.checkMarker(run.id,check.id)+'@example.test',reasoning:'Use exact marker'}:{action:'click',role:'button',name:check.buttonLabel,reasoning:'Submit configured form'},
     assessSeverity:async()=>assert.fail('Runtime persistence proof must not depend on an AI severity opinion'),
     summarizeFinding:async()=>assert.fail('Runtime proof already has a factual summary'),
    },
    '@/lib/public-http':{...load('lib/public-http.ts',{}),publicHttpRequest:async(url,options)=>{
     assert.equal(new URL(url).origin,origin);
     const response=await fetch(new URL(new URL(url).pathname,local),{method:options.method,headers:options.headers,body:options.body||undefined,redirect:'manual'});
     return{status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())};
    }},
   }).browserAgent;
   await worker.run({runId:run.id,agentIndex:0,appUrl:origin+'/'+scenario,assignment:{goal:check.title,steps:[{id:'database-'+check.id,title:check.title,detail:'Use the uniquely marked test email',databaseCheckId:check.id}]}});
   const results=await sql`SELECT status,evidence FROM run_test_results WHERE run_id=${run.id}`;
   const findings=await sql`SELECT title,fix_summary FROM findings WHERE run_id=${run.id}`;
   const assertion=(await sql`SELECT status FROM run_database_checks WHERE run_id=${run.id}`)[0];
   assert.equal(decisions,2,'Independent replay must execute recorded real actions, not ask a model to assert a result');
   if(scenario==='broken'){
    assert.equal(contexts,2);assert.equal(findings.length,1);assert.equal(results[0].status,'confirmed');assert.equal(assertion.status,'failed');
    assert.match(results[0].evidence,/Independent marker: preflight-.*-replay-/);
   }else if(scenario==='working'){
    assert.equal(contexts,1);assert.equal(findings.length,0);assert.equal(results[0].status,'passed');assert.equal(assertion.status,'passed');
   }else{
    assert.equal(contexts,1);assert.equal(findings.length,0);assert.equal(results[0].status,'inconclusive');
   }
   summaries.push({scenario,contexts,status:results[0].status,findings:findings.length});
  }
  assert.equal(writes,1,'Only the genuinely working app writes a row');
  console.log(JSON.stringify({realChromium:true,realPostgres:true,freshMarkerReplay:true,noModelVerdictUsed:true,results:summaries}));
 }finally{await browser?.close();await new Promise(resolve=>app.close(resolve));await state.close();await data.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
