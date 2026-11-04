const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { load } = require('./load-module.cjs');

test('project run summaries use the current repository and preserve owner, member and guest isolation', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE projects (id int PRIMARY KEY, owner_github_id text, app_url text,
        repo_full_name text, github_installation_id int, screenshot_retention_days int,
        display_name text, image_url text, created_at timestamptz DEFAULT NOW());
      CREATE TABLE runs (id int PRIMARY KEY, project_id int, repo_full_name text,
        status text, target_url text, created_at timestamptz DEFAULT NOW());
      CREATE TABLE findings (id int PRIMARY KEY, run_id int, deleted_at timestamptz);
      CREATE TABLE run_test_results (run_id int, status text);
      CREATE TABLE run_database_checks (run_id int, status text);
      CREATE TABLE project_members (project_id int, user_id text);
      CREATE TABLE guest_demo_sessions (project_id int, actor_id text);
      INSERT INTO projects (id,owner_github_id,repo_full_name) VALUES
        (1,'owner','owner/app'), (2,'owner','owner/empty'),
        (3,'stranger','stranger/private'), (4,'owner','owner/demo'), (5,'other','other/shared');
      INSERT INTO project_members VALUES (1,'member'), (5,'owner');
      INSERT INTO guest_demo_sessions VALUES (4,'guest:one');
      INSERT INTO runs (id,project_id,repo_full_name,status,target_url) VALUES
        (10,1,'owner/app','completed','https://app.example/old'),
        (11,1,'owner/app','failed','https://app.example/current'),
        (12,1,'owner/previous','completed','https://old.example'),
        (20,3,'stranger/private','completed','https://private.example'),
        (30,4,'owner/demo','completed','https://demo.example'),
        (40,5,NULL,'completed','https://shared.example');
      INSERT INTO findings VALUES (1,11,NULL), (2,11,NOW()), (3,10,NULL), (4,20,NULL);
    `);
    let reads = 0;
    const sql = async (parts, ...values) => {
      const text = parts.reduce((s, part, i) => s + (i ? `$${i}` : '') + part, '');
      // Schema migrations are outside this query test; run the real read against PostgreSQL.
      if (!/^\s*SELECT/.test(text)) return [];
      reads++;
      return (await db.query(text, values)).rows;
    };
    const { listProjects } = load('lib/schema.ts', { '@/lib/db': { getSql: () => sql } });
    const projects = await listProjects('owner');
    assert.equal(reads, 1, 'the summary must not introduce per-project requests');
    assert.deepEqual(projects.map(p => p.id).sort(), [1,2,5]);
    const app = projects.find(p => p.id === 1);
    assert.equal(app.role, 'owner');
    assert.equal(app.latest_run.id, 11, 'ignore runs for a former repository');
    assert.equal(app.latest_run.status, 'partial');
    assert.equal(app.latest_run.findings_count, 1, 'exclude deleted findings and other runs');
    assert.equal(app.latest_target_url, 'https://app.example/current');
    assert.equal(projects.find(p => p.id === 2).latest_run, null);
    assert.equal(projects.find(p => p.id === 5).role, 'member');
    assert.equal(projects.find(p => p.id === 5).latest_run.id, 40, 'keep legacy runs with no stored repository');
    const shared = await listProjects('member');
    assert.deepEqual(shared.map(p => p.id), [1]);
    assert.equal(shared[0].latest_run.id, 11);
    assert.deepEqual(await listProjects('unrelated'), []);
    await db.exec(`DELETE FROM findings WHERE run_id=11; INSERT INTO run_test_results VALUES (11,'passed')`);
    assert.equal((await listProjects('owner')).find(p => p.id === 1).latest_run.status, 'partial');
    await db.exec(`DELETE FROM run_test_results; INSERT INTO run_database_checks VALUES (11,'failed')`);
    assert.equal((await listProjects('owner')).find(p => p.id === 1).latest_run.status, 'partial');
    await db.exec('DELETE FROM run_database_checks');
    assert.equal((await listProjects('owner')).find(p => p.id === 1).latest_run.status, 'failed');
  } finally {
    await db.close();
  }
});
