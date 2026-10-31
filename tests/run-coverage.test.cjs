const {test}=require('node:test');const assert=require('node:assert/strict');const {PGlite}=require('@electric-sql/pglite');const {load}=require('./load-module.cjs');
test('completed failed database expectations do not make a confirmed report partial, while unresolved and provider errors do',async()=>{
 const db=new PGlite();try{
 await db.exec('CREATE TABLE run_test_results(run_id int,status text); CREATE TABLE run_database_checks(run_id int,status text)');
 const sql=async(parts,...args)=>{const q=parts.reduce((text,part,i)=>text+part+(i<args.length?'$'+(i+1):''),'');return(await db.query(q,args)).rows};
 const {runCoverage}=load('lib/run-coverage.ts',{'@/lib/db':{getSql:()=>sql}});
 await db.exec("INSERT INTO run_test_results VALUES(1,'passed'),(1,'confirmed'); INSERT INTO run_database_checks VALUES(1,'failed')");
 assert.deepEqual(await runCoverage(1),{observed:3,incomplete:0});
 await db.exec("INSERT INTO run_test_results VALUES(1,'inconclusive')");assert.equal((await runCoverage(1)).incomplete,1);
 await db.exec("INSERT INTO run_database_checks VALUES(1,'error')");assert.equal((await runCoverage(1)).incomplete,2);
 await db.exec("INSERT INTO run_test_results VALUES(2,'passed'); INSERT INTO run_database_checks VALUES(2,'pending')");
 assert.deepEqual(await runCoverage(2),{observed:1,incomplete:1});assert.deepEqual(await runCoverage(3),{observed:0,incomplete:0});
 }finally{await db.close()}
});
