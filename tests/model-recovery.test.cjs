const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./load-module.cjs');
const input={goal:'Inspect page',history:[],axTree:'heading: App',consoleLogs:[],screenshotBase64:'fixture'};
const done={action:'done',reasoning:'Page is visible'};
test('browser model recovers from a transient gateway failure and an empty provider reply',async()=>{
 const previous=global.fetch;process.env.OPENROUTER_API_KEY='fixture-only';
 try{
  for(const first of [new Response('{}',{status:503}),Response.json({choices:[]})]){
   let count=0;
   global.fetch=async(_url,options)=>{count++;const request=JSON.parse(options.body);assert.equal(request.max_tokens,4096);return count===1?first:Response.json({choices:[{message:{content:JSON.stringify(done)}}]});};
   const model=load('lib/models.ts',{'@/lib/model-config':{MODEL_CONFIG:{driver:{model:'fixture'}}}});
   assert.equal((await model.driverDecide(input)).action,'done');assert.equal(count,2);
  }
 }finally{global.fetch=previous;}
});
test('credential errors fail promptly and never echo a private provider response',async()=>{
 const previous=global.fetch;process.env.OPENROUTER_API_KEY='fixture-only';let calls=0;
 try{
  global.fetch=async()=>{calls++;return new Response('private response must not be copied',{status:401});};
  const model=load('lib/models.ts',{'@/lib/model-config':{MODEL_CONFIG:{driver:{model:'fixture'}}}});
  await assert.rejects(model.driverDecide(input),error=>error.message==='OpenRouter chat error 401');assert.equal(calls,1);
 }finally{global.fetch=previous;}
});
test('serialized worker errors preserve actionable categories without exposing secrets',()=>{
 const {safeRunFailure}=load('lib/run-details.ts',{});
 assert.match(safeRunFailure({type:'INTERNAL_ERROR',code:'TASK_PROCESS_OOM_KILLED'}),/memory allocation/);
 const text=safeRunFailure({type:'STRING_ERROR',raw:'Browserbase session error 429 wss://example?apiKey=private-token'});
 assert.match(text,/capacity/);assert.ok(!text.includes('private-token'));
});
