import { getSql } from "@/lib/db";

/* ------------------------------------------------------------------ */
/* PreFlight data model. Tables create themselves on first use via     */
/* ensureSchema(). Helpers scope every row to the caller's GitHub user */
/* id so users only ever see their own projects.                       */
/* ------------------------------------------------------------------ */

export interface Project {
  id: number;
  owner_github_id: string;
  app_url: string | null;
  repo_full_name: string;
  github_installation_id: number | null;
  screenshot_retention_days: number | null;
  created_at: string;
}

export interface Run {
  id: number;
  project_id: number;
  status: string;
  plan: unknown;
  target_url: string | null;
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
      app_url TEXT,
      repo_full_name TEXT NOT NULL,
      github_installation_id BIGINT,
      screenshot_retention_days INT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS runs (
      id SERIAL PRIMARY KEY,
      project_id INT REFERENCES projects(id),
      status TEXT NOT NULL DEFAULT 'queued',
      plan JSONB,
      target_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ
    )
  `;
  // Migrate tables created before these columns existed.
  await sql`ALTER TABLE projects ALTER COLUMN app_url DROP NOT NULL`;
  await sql`ALTER TABLE runs ADD COLUMN IF NOT EXISTS target_url TEXT`;
  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS screenshot_retention_days INT`;
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
  appUrl: string | null,
  repoFullName: string,
): Promise<Project> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    INSERT INTO projects (owner_github_id, app_url, repo_full_name)
    VALUES (${ownerGithubId}, ${appUrl}, ${repoFullName})
    RETURNING id, owner_github_id, app_url, repo_full_name,
              github_installation_id, screenshot_retention_days, created_at
  `;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Failed to create project");
  }
  return rows[0] as Project;
}

export async function listProjects(ownerGithubId: string): Promise<Project[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT id, owner_github_id, app_url, repo_full_name,
           github_installation_id, screenshot_retention_days, created_at
    FROM projects
    WHERE owner_github_id = ${ownerGithubId}
    ORDER BY created_at DESC
  `;
  if (!Array.isArray(rows)) return [];
  return rows as Project[];
}

export async function getProject(
  id: number,
  ownerGithubId: string,
): Promise<Project | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT id, owner_github_id, app_url, repo_full_name,
           github_installation_id, screenshot_retention_days, created_at
    FROM projects
    WHERE id = ${id} AND owner_github_id = ${ownerGithubId}
    LIMIT 1
  `;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0] as Project;
}

export interface RunSummary extends Run {
  findingsCount: number;
}

export async function listRuns(projectId: number): Promise<RunSummary[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT id, project_id, status, plan, target_url, created_at, started_at, finished_at,
      (SELECT COUNT(*)::int FROM findings WHERE findings.run_id = runs.id) AS "findingsCount"
    FROM runs
    WHERE project_id = ${projectId}
    ORDER BY created_at DESC
  `;
  if (!Array.isArray(rows)) return [];
  return rows as RunSummary[];
}

export interface Agent {
  id: number;
  run_id: number;
  assignment: unknown;
  status: string;
}

export async function createRun(
  projectId: number,
  targetUrl?: string | null,
): Promise<Run> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    INSERT INTO runs (project_id, status, target_url)
    VALUES (${projectId}, 'queued', ${targetUrl ?? null})
    RETURNING id, project_id, status, plan, target_url, created_at, started_at, finished_at
  `;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Failed to create run");
  }
  return rows[0] as Run;
}

/**
 * Cancel an active run. Scoped to the project and only touches runs that
 * are still in flight — a finished run can't be cancelled. Returns true
 * when a run was actually cancelled.
 */
export async function cancelRun(
  runId: number,
  projectId: number,
): Promise<boolean> {
  await ensureSchema();
  const rows = await getSql()`
    UPDATE runs SET status = 'cancelled', finished_at = NOW()
    WHERE id = ${runId} AND project_id = ${projectId}
      AND status IN ('queued', 'planning', 'planned', 'running')
    RETURNING id
  `;
  return Array.isArray(rows) && rows.length > 0;
}

export async function updateRunStatus(
  runId: number,
  status: string,
): Promise<void> {
  await ensureSchema();
  await getSql()`UPDATE runs SET status = ${status} WHERE id = ${runId}`;
}

export async function createAgent(
  runId: number,
  assignment: unknown,
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
  status: string,
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

export interface FindingReport {
  id: number;
  title: string;
  severity: string | null;
  status: string;
  repro_steps: string | null;
  screenshot_url: string | null;
  console_logs: string | null;
  network_errors: unknown;
  root_cause: string | null;
  confidence: string | null;
  patch_diff: string | null;
  pr_url: string | null;
  pr_number: number | null;
  pr_state: string | null;
}

/** A report is scoped to both its project and the signed-in owner. */
export async function getRunReport(
  projectId: number,
  runId: number,
  ownerGithubId: string,
): Promise<{ run: Run; findings: FindingReport[] } | null> {
  await ensureSchema();
  const sql = getSql();
  const runs = await sql`
    SELECT r.* FROM runs r
    JOIN projects p ON p.id = r.project_id
    WHERE r.id = ${runId} AND r.project_id = ${projectId}
      AND p.owner_github_id = ${ownerGithubId}
    LIMIT 1
  `;
  if (!Array.isArray(runs) || !runs.length) return null;
  const findings = await sql`
    SELECT f.id, f.title, f.severity, f.status, f.repro_steps,
      f.screenshot_url, f.console_logs, f.network_errors,
      d.root_cause, d.confidence, d.patch_diff,
      pr.pr_url, pr.pr_number, pr.state AS pr_state
    FROM findings f
    LEFT JOIN diagnoses d ON d.finding_id = f.id
    LEFT JOIN LATERAL (
      SELECT pr_url, pr_number, state FROM pull_requests
      WHERE diagnosis_id = d.id ORDER BY id DESC LIMIT 1
    ) pr ON TRUE
    WHERE f.run_id = ${runId}
    ORDER BY CASE f.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1
      WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, f.id
  `;
  return { run: runs[0] as Run, findings: findings as FindingReport[] };
}

export async function updateProjectAppUrl(
  projectId: number,
  ownerGithubId: string,
  appUrl: string | null,
): Promise<boolean> {
  await ensureSchema();
  const rows = await getSql()`
    UPDATE projects SET app_url = ${appUrl}
    WHERE id = ${projectId} AND owner_github_id = ${ownerGithubId}
    RETURNING id
  `;
  return Array.isArray(rows) && rows.length > 0;
}
