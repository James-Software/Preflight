// Repeatable foreground browser samples, without authentication or paid providers.
const {chromium}=require('playwright-core');
const {chromiumPath}=require('../tests/browser-fixture.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:chromiumPath,args:['--no-sandbox']});const samples=[];
 try {for(let i=0;i<5;i++){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  await page.bringToFront();await page.goto(process.argv[2]||'https://www.trypreflight.dev/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>performance.getEntriesByName('first-contentful-paint').length>0,{},{timeout:10000});
  samples.push(await page.evaluate(()=>{const n=performance.getEntriesByType('navigation')[0],f=performance.getEntriesByName('first-contentful-paint')[0];return{ttfbMs:Math.round(n.responseStart),domReadyMs:Math.round(n.domContentLoadedEventEnd),fcpMs:Math.round(f.startTime)}}));await context.close();
 }console.log(JSON.stringify({browserVersion:browser.version(),measuredAt:new Date().toISOString(),device:'headless Chromium, cloud workspace, foreground tabs, fresh contexts, 1440x1000, no throttling',samples},null,2));}finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
