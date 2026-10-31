const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./load-module.cjs');
const {discoverSmokeSteps}=load('lib/smoke-plan.ts',{});
test('plans visible anchor pages and forms, never preloads, icons or script strings',()=>{
 const steps=discoverSmokeSteps('https://app.example/',`<link href="/_next/chunk.js"><link href="/icon.svg"><a href="/about">About</a><a href='/docs'>Docs</a><a href="/about#more">Duplicate</a><a href="https://other.example/page">Outside</a><a href="/api/delete">API</a><a href="/manual.pdf">Download</a><script>let fake='<a href="/fake">Fake</a><form>';</script><form><input></form>`);
 assert.deepEqual(steps.map(s=>s.title),['Visit /about','Visit /docs','Exercise form #1']);
});
test('handles malformed URLs, comments, unquoted attributes and encoded assets',()=>{
 const steps=discoverSmokeSteps('https://app.example/',`<!--<a href="/hidden">--><a href=/terms>Terms</a><a href="/x%2ejs">JS</a><a href="http://[">Bad</a><a href="#local">Local</a><form></form>`);
 assert.deepEqual(steps.map(s=>s.title),['Visit /terms','Exercise form #1']);
});
test('replaces only the matching form with its explicit database workflow',()=>{
 const html='<form><button>Join the waitlist</button></form><form><button>Search</button></form>';
 assert.deepEqual(discoverSmokeSteps('https://app.example/',html,['Join the waitlist']).map(s=>s.id),['form-2']);
});
