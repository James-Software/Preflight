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
  latest_target_url?: string | null;
  repo_full_name: string;
  display_name?: string | null;
  image_url?: string | null;
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
  archived_at: string | null;
  target_ref?: string | null;
  target_sha?: string | null;
  auth_profile_name?: string | null;
  database_check_count?: number;
  database_snapshot?: unknown;
  repo_full_name?: string | null;
}

let schemaInitialization: Promise<void> | undefined;

/** Share initialization across concurrent requests; retry a failed attempt. */
export function ensureSchema(): Promise<void> {
  if (!schemaInitialization) {
    schemaInitialization = initializeSchema().catch((error) => {
      schemaInitialization = undefined;
      throw error;
    });
  }
  return schemaInitialization;
}

async function initializeSchema(): Promise<void> {
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
  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS display_name TEXT`;
  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS image_url TEXT`;
  await sql`ALTER TABLE runs ADD COLUMN IF NOT EXISTS repo_full_name TEXT`;
  await sql`UPDATE runs SET repo_full_name=p.repo_full_name FROM projects p WHERE runs.project_id=p.id AND runs.repo_full_name IS NULL`;
  await sql`ALTER TABLE runs ADD COLUMN IF NOT EXISTS target_url TEXT`;
  await sql`ALTER TABLE runs ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`;
  await sql`CREATE TABLE IF NOT EXISTS auth_profiles (
    id SERIAL PRIMARY KEY, owner_github_id TEXT NOT NULL, name TEXT NOT NULL,
    origin TEXT NOT NULL, encrypted_state TEXT NOT NULL,
    verification_path TEXT NOT NULL DEFAULT '/', verification_text TEXT,
    revoked_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS test_users (
    id TEXT PRIMARY KEY, capture_id UUID UNIQUE NOT NULL, owner_github_id TEXT NOT NULL,
    project_id INT NOT NULL REFERENCES projects(id), name TEXT NOT NULL, email TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS profile_captures (
    id UUID PRIMARY KEY, owner_github_id TEXT NOT NULL, name TEXT NOT NULL,
    origin TEXT NOT NULL, verification_path TEXT NOT NULL, verification_text TEXT NOT NULL,
    session_id TEXT, status TEXT NOT NULL DEFAULT 'active',
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '10 minutes'
  )`;
  await sql`ALTER TABLE auth_profiles ADD COLUMN IF NOT EXISTS project_id INT REFERENCES projects(id)`;
  await sql`ALTER TABLE profile_captures ADD COLUMN IF NOT EXISTS project_id INT REFERENCES projects(id)`;
  await sql`ALTER TABLE profile_captures ADD COLUMN IF NOT EXISTS automation_status TEXT`;
  await sql`ALTER TABLE profile_captures ADD COLUMN IF NOT EXISTS automation_message TEXT`;
  await sql`ALTER TABLE profile_captures ADD COLUMN IF NOT EXISTS automation_credentials TEXT`;
  await sql`ALTER TABLE profile_captures ADD COLUMN IF NOT EXISTS automation_token UUID`;
  await sql`ALTER TABLE profile_captures ADD COLUMN IF NOT EXISTS automation_resume BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE profile_captures ADD COLUMN IF NOT EXISTS automation_live_url TEXT`;
  await sql`ALTER TABLE profile_captures ADD COLUMN IF NOT EXISTS automation_github_grant TEXT`;
  await sql`ALTER TABLE profile_captures ADD COLUMN IF NOT EXISTS automation_auth_state TEXT`;
  await sql`ALTER TABLE auth_profiles ADD COLUMN IF NOT EXISTS source_capture_id UUID`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS auth_profile_source_capture ON auth_profiles(source_capture_id) WHERE source_capture_id IS NOT NULL`;
  await sql`DROP INDEX IF EXISTS profile_capture_active_owner`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS profile_capture_active_project ON profile_captures(owner_github_id,project_id) WHERE status IN ('active','saving')`;
  await sql`ALTER TABLE runs ADD COLUMN IF NOT EXISTS auth_profile_id INT REFERENCES auth_profiles(id)`;
  await sql`ALTER TABLE runs ADD COLUMN IF NOT EXISTS auth_profile_snapshot JSONB`;
  await sql`ALTER TABLE runs ADD COLUMN IF NOT EXISTS auth_profile_name TEXT`;
  // Assign legacy sessions only when ownership/origin/history identify one project.
  // Ambiguous sessions stay unassigned until their owner explicitly moves them.
  await sql`WITH candidates AS (
    SELECT a.id,p.id AS project_id FROM auth_profiles a JOIN projects p ON p.owner_github_id=a.owner_github_id
    WHERE a.project_id IS NULL AND (
      lower(substring(p.app_url FROM '^https?://[^/?#]+'))=lower(a.origin)
      OR EXISTS (SELECT 1 FROM runs r WHERE r.project_id=p.id AND r.auth_profile_id=a.id)
    )
  ), matched AS (SELECT id,min(project_id) AS project_id FROM candidates GROUP BY id HAVING count(*)=1)
  UPDATE auth_profiles a SET project_id=m.project_id FROM matched m WHERE a.id=m.id AND a.project_id IS NULL`;
  await sql`CREATE TABLE IF NOT EXISTS database_provider_accounts (
    owner_github_id TEXT NOT NULL, provider TEXT NOT NULL, encrypted_tokens TEXT NOT NULL,
    refresh_until TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(owner_github_id,provider)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS project_database_connections (
    id SERIAL PRIMARY KEY, project_id INT NOT NULL REFERENCES projects(id), origin TEXT NOT NULL,
    encrypted_config TEXT NOT NULL, check_count INT NOT NULL, revoked_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`ALTER TABLE project_database_connections DROP CONSTRAINT IF EXISTS project_database_connections_project_id_origin_key`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS project_database_connections_active_origin ON project_database_connections(project_id, origin) WHERE revoked_at IS NULL`;
  await sql`ALTER TABLE runs ADD COLUMN IF NOT EXISTS database_snapshot JSONB`;
  await sql`ALTER TABLE runs ADD COLUMN IF NOT EXISTS database_check_count INT NOT NULL DEFAULT 0`;
  await sql`CREATE TABLE IF NOT EXISTS run_database_checks (
    id SERIAL PRIMARY KEY, run_id INT NOT NULL REFERENCES runs(id), check_id TEXT NOT NULL,
    title TEXT NOT NULL, button_label TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
    summary TEXT, completed_at TIMESTAMPTZ, UNIQUE(run_id, check_id)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS run_database_cleanup (
    id UUID PRIMARY KEY, run_id INT NOT NULL REFERENCES runs(id),
    record_key TEXT NOT NULL, proposal JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), decided_at TIMESTAMPTZ,
    UNIQUE(run_id, record_key)
  )`;
  await sql`ALTER TABLE runs ADD COLUMN IF NOT EXISTS target_ref TEXT`;
  await sql`ALTER TABLE runs ADD COLUMN IF NOT EXISTS target_sha TEXT`;
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
  await sql`ALTER TABLE findings ADD COLUMN IF NOT EXISTS fix_summary TEXT`;
  await sql`ALTER TABLE findings ADD COLUMN IF NOT EXISTS evidence_key TEXT`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS finding_run_evidence ON findings(run_id,evidence_key) WHERE evidence_key IS NOT NULL`;
  await sql`CREATE TABLE IF NOT EXISTS run_test_results (
    id SERIAL PRIMARY KEY, run_id INT NOT NULL REFERENCES runs(id), agent_index INT NOT NULL,
    step_id TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL, summary TEXT NOT NULL,
    evidence TEXT, completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(run_id,agent_index,step_id)
  )`;
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
    CREATE TABLE IF NOT EXISTS fix_pr_groups (
      id UUID PRIMARY KEY,
      run_id INT NOT NULL REFERENCES runs(id),
      finding_ids JSONB NOT NULL,
      branch TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending',
      pr_url TEXT,
      pr_number INT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE findings ADD COLUMN IF NOT EXISTS pr_group_id UUID REFERENCES fix_pr_groups(id)`;
  await sql`ALTER TABLE fix_pr_groups ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ`;
  await sql`ALTER TABLE findings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`;
  await sql`ALTER TABLE fix_pr_groups ADD COLUMN IF NOT EXISTS error_summary TEXT`;
  await sql`ALTER TABLE fix_pr_groups ADD COLUMN IF NOT EXISTS github_grant TEXT`;
  await sql`ALTER TABLE fix_pr_groups ADD COLUMN IF NOT EXISTS worker_token UUID`;
  await sql`ALTER TABLE fix_pr_groups ADD COLUMN IF NOT EXISTS worker_lease_until TIMESTAMPTZ`;
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
  displayName: string | null = null,
): Promise<Project> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    INSERT INTO projects (owner_github_id, app_url, repo_full_name, display_name)
    VALUES (${ownerGithubId}, ${appUrl}, ${repoFullName}, ${displayName})
    RETURNING id, owner_github_id, app_url, repo_full_name,
              github_installation_id, screenshot_retention_days, display_name, image_url, created_at
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
           github_installation_id, screenshot_retention_days, display_name, image_url, created_at,
      (SELECT target_url FROM runs WHERE project_id = projects.id AND target_url IS NOT NULL AND (runs.repo_full_name = projects.repo_full_name OR runs.repo_full_name IS NULL) ORDER BY id DESC LIMIT 1) AS latest_target_url
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
           github_installation_id, screenshot_retention_days, display_name, image_url, created_at,
      (SELECT target_url FROM runs WHERE project_id = projects.id AND target_url IS NOT NULL AND (runs.repo_full_name = projects.repo_full_name OR runs.repo_full_name IS NULL) ORDER BY id DESC LIMIT 1) AS latest_target_url
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
    SELECT id, project_id, status, plan, target_url, created_at, started_at, finished_at, archived_at, target_ref, target_sha, auth_profile_name,
      (SELECT COUNT(*)::int FROM findings WHERE findings.run_id = runs.id AND findings.deleted_at IS NULL) AS "findingsCount"
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
  options?: {
    targetRef?: string;
    repoFullName?: string;
    targetSha?: string;
    profile?: { id: number; name: string; snapshot: unknown };
    database?: {
      snapshot: unknown;
      checks: { id: string; title: string; buttonLabel: string }[];
    };
  },
): Promise<Run> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    WITH new_run AS (
      INSERT INTO runs (project_id, repo_full_name, status, target_url, target_ref, target_sha, auth_profile_id, auth_profile_name, auth_profile_snapshot, database_snapshot, database_check_count)
      VALUES (${projectId}, COALESCE(${options?.repoFullName ?? null}, (SELECT repo_full_name FROM projects WHERE id=${projectId})), 'queued', ${targetUrl ?? null}, ${options?.targetRef ?? null}, ${options?.targetSha ?? null},
        ${options?.profile?.id ?? null}, ${options?.profile?.name ?? null}, ${JSON.stringify(options?.profile?.snapshot ?? null)}::jsonb,
        ${JSON.stringify(options?.database?.snapshot ?? null)}::jsonb, ${options?.database?.checks.length ?? 0})
      RETURNING id, project_id, repo_full_name, status, plan, target_url, created_at, started_at, finished_at, archived_at, target_ref, target_sha, auth_profile_name, database_check_count
    ), seeded_checks AS (
      INSERT INTO run_database_checks (run_id, check_id, title, button_label)
      SELECT new_run.id, c.check_id, c.title, c.button_label FROM new_run
      CROSS JOIN jsonb_to_recordset(${JSON.stringify((options?.database?.checks ?? []).map((c) => ({ check_id: c.id, title: c.title, button_label: c.buttonLabel })))}::jsonb) AS c(check_id TEXT, title TEXT, button_label TEXT)
      RETURNING id
    ) SELECT * FROM new_run
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

/** Archiving changes visibility only; it never stops work or removes evidence. */
export async function setRunArchived(
  runId: number,
  projectId: number,
  owner: string,
  archived: boolean,
): Promise<boolean> {
  await ensureSchema();
  const rows = await getSql()`
    UPDATE runs r SET archived_at = CASE WHEN ${archived} THEN COALESCE(r.archived_at, NOW()) ELSE NULL END
    FROM projects p
    WHERE r.id = ${runId} AND r.project_id = ${projectId} AND p.id = r.project_id
      AND p.owner_github_id = ${owner}
      AND (${archived} = FALSE OR r.status IN ('done', 'completed', 'failed', 'cancelled'))
    RETURNING r.id
  `;
  return Array.isArray(rows) && rows.length > 0;
}

export async function updateRunStatus(
  runId: number,
  status: string,
): Promise<void> {
  await ensureSchema();
  await getSql()`UPDATE runs SET status = ${status} WHERE id = ${runId} AND (status <> 'cancelled' OR ${status} = 'cancelled')`;
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
  fixSummary?: string;
  evidenceKey?: string;
}): Promise<boolean> {
  await ensureSchema();
  const rows = await getSql()`
    INSERT INTO findings
      (run_id, agent_id, severity, title, repro_steps, screenshot_url,
       console_logs, network_errors, status, fix_summary, evidence_key)
    VALUES
      (${input.runId}, ${input.agentId}, ${input.severity}, ${input.title},
       ${input.reproSteps}, ${input.screenshotUrl}, ${input.consoleLogs},
       ${JSON.stringify(input.networkErrors)}::jsonb, 'open', ${input.fixSummary ?? null}, ${input.evidenceKey ?? null})
    ON CONFLICT(run_id,evidence_key) WHERE evidence_key IS NOT NULL DO NOTHING RETURNING id
  `;
  return Array.isArray(rows) && rows.length > 0;
}

export type TestStepResult = {
  step_id: string;
  title: string;
  status: string;
  summary: string;
  evidence?: string | null;
};
export async function recordTestResult(
  runId: number,
  agentIndex: number,
  result: TestStepResult,
) {
  await ensureSchema();
  await getSql()`INSERT INTO run_test_results(run_id,agent_index,step_id,title,status,summary,evidence)
    VALUES(${runId},${agentIndex},${result.step_id},${result.title.slice(0, 200)},${result.status},${result.summary.slice(0, 1000)},${result.evidence?.slice(0, 8000) || null})
    ON CONFLICT(run_id,agent_index,step_id) DO UPDATE SET status=EXCLUDED.status,summary=EXCLUDED.summary,evidence=EXCLUDED.evidence,completed_at=NOW()`;
}

export interface DatabaseCheckReport {
  check_id: string;
  title: string;
  button_label: string;
  status: string;
  summary: string | null;
  completed_at: string | null;
}

export interface FindingReport {
  fix_summary?: string | null;
  pr_error?: string | null;
  pr_group_id: string | null;
  pr_group_state: string | null;
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
): Promise<{
  run: Run;
  findings: FindingReport[];
  databaseChecks: DatabaseCheckReport[];
  testResults: TestStepResult[];
} | null> {
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
    SELECT f.id, f.title, f.severity, f.status, f.repro_steps, f.fix_summary,
      f.screenshot_url, f.console_logs, f.network_errors,
      d.root_cause, d.confidence, d.patch_diff,
      COALESCE(g.pr_url, pr.pr_url) AS pr_url,
      COALESCE(g.pr_number, pr.pr_number) AS pr_number,
      COALESCE(g.state, pr.state) AS pr_state,
      f.pr_group_id, g.state AS pr_group_state, g.error_summary AS pr_error
    FROM findings f
    LEFT JOIN diagnoses d ON d.finding_id = f.id
    LEFT JOIN fix_pr_groups g ON g.id = f.pr_group_id
    LEFT JOIN LATERAL (
      SELECT pr_url, pr_number, state FROM pull_requests
      WHERE diagnosis_id = d.id ORDER BY id DESC LIMIT 1
    ) pr ON TRUE
    WHERE f.run_id = ${runId} AND f.deleted_at IS NULL
    ORDER BY CASE f.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1
      WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, f.id
  `;
  const databaseChecks =
    await sql`SELECT check_id, title, button_label, status, summary, completed_at
    FROM run_database_checks WHERE run_id = ${runId} ORDER BY id`;
  const testResults =
    await sql`SELECT step_id,title,status,summary,evidence FROM run_test_results WHERE run_id=${runId} ORDER BY id`;
  return {
    run: runs[0] as Run,
    findings: findings as FindingReport[],
    databaseChecks: (Array.isArray(databaseChecks)
      ? databaseChecks
      : []) as DatabaseCheckReport[],
    testResults: Array.isArray(testResults)
      ? (testResults as TestStepResult[])
      : [],
  };
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

export async function updateProjectSettings(
  projectId: number,
  owner: string,
  settings: {
    displayName: string | null;
    appUrl: string | null;
    repoFullName: string;
    imageUrl: string | null;
  },
) {
  await ensureSchema();
  const rows =
    await getSql()`UPDATE projects SET display_name=${settings.displayName},app_url=${settings.appUrl},image_url=${settings.imageUrl},
    github_installation_id=CASE WHEN repo_full_name=${settings.repoFullName} THEN github_installation_id ELSE NULL END,repo_full_name=${settings.repoFullName}
    WHERE id=${projectId} AND owner_github_id=${owner} RETURNING id`;
  return Array.isArray(rows) && rows.length > 0;
}
