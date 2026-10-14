import { getSql } from "@/lib/db";

/* ------------------------------------------------------------------ */
/* PreFlight data model. Tables create themselves on first use via     */
/* ensureSchema(). Helpers scope every row to the caller's GitHub user */
/* id so users only ever see their own projects.                       */
/* ------------------------------------------------------------------ */

export interface Project {
  id: number;
  owner_github_id: string;
  app_url: string;
  repo_full_name: string;
  github_installation_id: number | null;
  created_at: string;
}

export interface Run {
  id: number;
  project_id: number;
  status: string;
  plan: unknown;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export async function ensureSchema(): Promise<void> {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      owner_github_id TEXT NOT NULL,
      app_url TEXT NOT NULL,
      repo_full_name TEXT NOT NULL,
      github_installation_id BIGINT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS runs (
      id SERIAL PRIMARY KEY,
      project_id INT REFERENCES projects(id),
      status TEXT NOT NULL DEFAULT 'queued',
      plan JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS agents (
      id SERIAL PRIMARY KEY,
      run_id INT REFERENCES runs(id),
      assignment TEXT,
      status TEXT NOT NULL DEFAULT 'queued'
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS findings (
      id SERIAL PRIMARY KEY,
      run_id INT REFERENCES runs(id),
      agent_id INT REFERENCES agents(id),
      severity TEXT,
      title TEXT NOT NULL,
      repro_steps TEXT,
      screenshot_url TEXT,
      console_logs TEXT,
      network_errors JSONB,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS diagnoses (
      id SERIAL PRIMARY KEY,
      finding_id INT REFERENCES findings(id) UNIQUE,
      root_cause TEXT,
      implicated_files JSONB,
      patch_diff TEXT,
      confidence TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS pull_requests (
      id SERIAL PRIMARY KEY,
      diagnosis_id INT REFERENCES diagnoses(id),
      pr_url TEXT,
      pr_number INT,
      state TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS credit_ledger (
      id SERIAL PRIMARY KEY,
      owner_github_id TEXT NOT NULL,
      amount INT NOT NULL,
      reason TEXT,
      run_id INT REFERENCES runs(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

export async function createProject(
  ownerGithubId: string,
  appUrl: string,
  repoFullName: string
): Promise<Project> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    INSERT INTO projects (owner_github_id, app_url, repo_full_name)
    VALUES (${ownerGithubId}, ${appUrl}, ${repoFullName})
    RETURNING id, owner_github_id, app_url, repo_full_name,
              github_installation_id, created_at
  `;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Failed to create project");
  }
  return rows[0] as Project;
}

export async function listProjects(
  ownerGithubId: string
): Promise<Project[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT id, owner_github_id, app_url, repo_full_name,
           github_installation_id, created_at
    FROM projects
    WHERE owner_github_id = ${ownerGithubId}
    ORDER BY created_at DESC
  `;
  if (!Array.isArray(rows)) return [];
  return rows as Project[];
}

export async function getProject(
  id: number,
  ownerGithubId: string
): Promise<Project | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT id, owner_github_id, app_url, repo_full_name,
           github_installation_id, created_at
    FROM projects
    WHERE id = ${id} AND owner_github_id = ${ownerGithubId}
    LIMIT 1
  `;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0] as Project;
}

export async function listRuns(projectId: number): Promise<Run[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT id, project_id, status, plan, created_at, started_at, finished_at
    FROM runs
    WHERE project_id = ${projectId}
    ORDER BY created_at DESC
  `;
  if (!Array.isArray(rows)) return [];
  return rows as Run[];
}

export interface Agent {
  id: number;
  run_id: number;
  assignment: unknown;
  status: string;
}

export async function createRun(projectId: number): Promise<Run> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    INSERT INTO runs (project_id, status)
    VALUES (${projectId}, 'queued')
    RETURNING id, project_id, status, plan, created_at, started_at, finished_at
  `;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Failed to create run");
  }
  return rows[0] as Run;
}

export async function updateRunStatus(
  runId: number,
  status: string
): Promise<void> {
  await ensureSchema();
  await getSql()`UPDATE runs SET status = ${status} WHERE id = ${runId}`;
}

export async function createAgent(
  runId: number,
  assignment: unknown
): Promise<Agent> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    INSERT INTO agents (run_id, assignment, status)
    VALUES (${runId}, ${JSON.stringify(assignment)}, 'queued')
    RETURNING id, run_id, assignment, status
  `;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Failed to create agent");
  }
  return rows[0] as Agent;
}

export async function updateAgentStatus(
  agentId: number,
  status: string
): Promise<void> {
  await ensureSchema();
  await getSql()`UPDATE agents SET status = ${status} WHERE id = ${agentId}`;
}

export async function createFinding(input: {
  runId: number;
  agentId: number | null;
  severity: string;
  title: string;
  reproSteps: string | null;
  screenshotUrl: string | null;
  consoleLogs: string | null;
  networkErrors: unknown;
}): Promise<void> {
  await ensureSchema();
  await getSql()`
    INSERT INTO findings
      (run_id, agent_id, severity, title, repro_steps, screenshot_url,
       console_logs, network_errors, status)
    VALUES
      (${input.runId}, ${input.agentId}, ${input.severity}, ${input.title},
       ${input.reproSteps}, ${input.screenshotUrl}, ${input.consoleLogs},
       ${JSON.stringify(input.networkErrors)}::jsonb, 'open')
  `;
}
