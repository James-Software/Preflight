import { getSql } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";

/** Delete only an owner's project and its derived guest/test workspaces atomically. */
export async function deleteProject(projectId: number, owner: string) {
  if (
    !Number.isSafeInteger(projectId) ||
    projectId < 1 ||
    !owner ||
    owner.startsWith("guest:")
  )
    return null;
  await ensureSchema();
  const sql = getSql();
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await sql.transaction(
        (tx) => [
          tx`SELECT id FROM projects WHERE id=${projectId} AND owner_github_id=${owner} FOR UPDATE`,
          tx`CREATE TEMP TABLE project_delete_scope ON COMMIT DROP AS
          WITH RECURSIVE edges AS (
            SELECT l.template_project_id AS parent_id,p.id AS child_id FROM guest_demo_sessions s
              JOIN guest_demo_links l ON l.token_hash=s.link_hash JOIN projects p ON p.id=s.project_id
              JOIN projects parent ON parent.id=l.template_project_id WHERE p.owner_github_id=parent.owner_github_id
            UNION SELECT u.project_id,p.id FROM test_users u JOIN projects p ON p.owner_github_id=u.id
          ), scope(id) AS (
            SELECT id FROM projects WHERE id=${projectId} AND owner_github_id=${owner}
            UNION SELECT e.child_id FROM edges e JOIN scope s ON s.id=e.parent_id
          ) SELECT id FROM scope`,
          tx`SELECT p.id FROM projects p JOIN project_delete_scope s ON s.id=p.id ORDER BY p.id FOR UPDATE OF p`,
          tx`CREATE TEMP TABLE project_delete_runs ON COMMIT DROP AS SELECT id FROM runs WHERE project_id IN (SELECT id FROM project_delete_scope)`,
          tx`SELECT id FROM runs WHERE id IN (SELECT id FROM project_delete_runs) ORDER BY id FOR UPDATE`,
          tx`SELECT 'sandbox' AS kind,sandbox_name AS id FROM browser_sandbox_sessions WHERE run_id IN (SELECT id FROM project_delete_runs) AND sandbox_name IS NOT NULL AND state<>'closed'
          UNION SELECT 'browserbase',session_id FROM profile_captures WHERE project_id IN (SELECT id FROM project_delete_scope) AND status IN ('active','saving') AND session_id IS NOT NULL`,
          tx`INSERT INTO retired_screenshot_blobs(url) SELECT screenshot_url FROM findings WHERE run_id IN (SELECT id FROM project_delete_runs)
          AND screenshot_url LIKE 'https://%.public.blob.vercel-storage.com/preflight/runs/%'
          AND substring(screenshot_url FROM '/preflight/runs/([0-9]+)/')=run_id::text ON CONFLICT(url) DO NOTHING`,
          tx`UPDATE retired_screenshot_blobs SET private_content=NULL WHERE substring(url FROM '/preflight/runs/([0-9]+)/') IN (SELECT id::text FROM project_delete_runs)`,
          tx`DELETE FROM run_agent_source_reads WHERE grant_id IN (SELECT id FROM run_agent_grants WHERE project_id IN (SELECT id FROM project_delete_scope) OR run_id IN (SELECT id FROM project_delete_runs))`,
          tx`DELETE FROM run_agent_reviews WHERE run_id IN (SELECT id FROM project_delete_runs) OR grant_id IN (SELECT id FROM run_agent_grants WHERE project_id IN (SELECT id FROM project_delete_scope))`,
          tx`DELETE FROM run_agent_grants WHERE project_id IN (SELECT id FROM project_delete_scope) OR run_id IN (SELECT id FROM project_delete_runs)`,
          tx`DELETE FROM pull_requests WHERE diagnosis_id IN (SELECT d.id FROM diagnoses d JOIN findings f ON f.id=d.finding_id WHERE f.run_id IN (SELECT id FROM project_delete_runs))`,
          tx`DELETE FROM diagnoses WHERE finding_id IN (SELECT id FROM findings WHERE run_id IN (SELECT id FROM project_delete_runs))`,
          tx`DELETE FROM findings WHERE run_id IN (SELECT id FROM project_delete_runs)`,
          tx`DELETE FROM agents WHERE run_id IN (SELECT id FROM project_delete_runs)`,
          tx`DELETE FROM fix_pr_groups WHERE run_id IN (SELECT id FROM project_delete_runs)`,
          tx`DELETE FROM run_check_investigations WHERE run_id IN (SELECT id FROM project_delete_runs)`,
          tx`DELETE FROM run_test_results WHERE run_id IN (SELECT id FROM project_delete_runs)`,
          tx`DELETE FROM run_database_cleanup WHERE run_id IN (SELECT id FROM project_delete_runs)`,
          tx`DELETE FROM run_database_checks WHERE run_id IN (SELECT id FROM project_delete_runs)`,
          tx`DELETE FROM run_screenshots WHERE run_id IN (SELECT id FROM project_delete_runs)`,
          tx`DELETE FROM browser_sandbox_sessions WHERE run_id IN (SELECT id FROM project_delete_runs)`,
          // Account-level credit history must survive project deletion.
          tx`UPDATE credit_ledger SET run_id=NULL WHERE run_id IN (SELECT id FROM project_delete_runs)`,
          tx`DELETE FROM runs WHERE id IN (SELECT id FROM project_delete_runs)`,
          tx`UPDATE runs SET auth_profile_id=NULL,auth_profile_snapshot=NULL WHERE auth_profile_id IN (SELECT id FROM auth_profiles WHERE project_id IN (SELECT id FROM project_delete_scope))`,
          tx`DELETE FROM auth_profiles WHERE project_id IN (SELECT id FROM project_delete_scope)`,
          tx`DELETE FROM profile_captures WHERE project_id IN (SELECT id FROM project_delete_scope)`,
          tx`DELETE FROM test_users WHERE project_id IN (SELECT id FROM project_delete_scope)`,
          tx`DELETE FROM project_database_connections WHERE project_id IN (SELECT id FROM project_delete_scope)`,
          tx`DELETE FROM project_invite_verifications WHERE invite_id IN (SELECT id FROM project_invitations WHERE project_id IN (SELECT id FROM project_delete_scope))`,
          tx`DELETE FROM project_invitations WHERE project_id IN (SELECT id FROM project_delete_scope)`,
          tx`DELETE FROM project_members WHERE project_id IN (SELECT id FROM project_delete_scope)`,
          tx`DELETE FROM guest_demo_sessions WHERE project_id IN (SELECT id FROM project_delete_scope)`,
          tx`DELETE FROM guest_demo_links WHERE template_project_id IN (SELECT id FROM project_delete_scope)`,
          tx`DELETE FROM projects WHERE id IN (SELECT id FROM project_delete_scope) RETURNING id`,
        ],
        { isolationLevel: "Serializable" },
      );
      if (!(result[0] as any[]).length) return null;
      return {
        deleted: (result.at(-1) as { id: number }[]).map((row) => row.id),
        resources: result[5] as {
          kind: "sandbox" | "browserbase";
          id: string;
        }[],
      };
    } catch (error) {
      if (
        attempt < 2 &&
        ["40001", "40P01"].includes(String((error as { code?: string }).code))
      )
        continue;
      throw error;
    }
  }
}
