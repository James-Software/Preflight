import { ensureSchema } from "@/lib/schema";
import { getSql } from "@/lib/db";
/** Operator-requested retries preserve the original report and its evidence. */
export async function claimRequestedRunRetry() {
  await ensureSchema();
  const rows = await getSql()`WITH request AS (
    SELECT q.* FROM run_retry_requests q JOIN runs r ON r.id=q.source_run_id JOIN projects p ON p.id=r.project_id
    WHERE q.requested_owner=p.owner_github_id AND r.repo_full_name=p.repo_full_name AND r.status='partial' AND r.archived_at IS NULL
      AND q.expires_at>NOW() AND q.attempts<3 AND (q.status='queued' OR q.status='dispatching' AND q.lease_until<NOW())
    ORDER BY q.created_at LIMIT 1 FOR UPDATE OF q SKIP LOCKED
  ), created AS (
    INSERT INTO runs(project_id,repo_full_name,status,target_url,target_ref,target_sha,auth_profile_id,auth_profile_name,auth_profile_snapshot,database_snapshot,database_check_count)
    SELECT r.project_id,r.repo_full_name,'queued',r.target_url,r.target_ref,r.target_sha,r.auth_profile_id,r.auth_profile_name,r.auth_profile_snapshot,r.database_snapshot,r.database_check_count
    FROM runs r JOIN request q ON q.source_run_id=r.id WHERE q.new_run_id IS NULL RETURNING id
  ) UPDATE run_retry_requests q SET new_run_id=COALESCE(q.new_run_id,(SELECT id FROM created)),status='dispatching',attempts=q.attempts+1,lease_until=NOW()+INTERVAL '2 minutes'
    FROM request s WHERE q.id=s.id RETURNING q.id,q.new_run_id,q.attempts`;
  return (
    (rows as { id: string; new_run_id: number; attempts: number }[])[0] || null
  );
}

export async function dispatchRequestedRunRetry(
  enqueue: (runId: number, key: string) => Promise<unknown>,
) {
  const request = await claimRequestedRunRetry();
  if (!request) return 0;
  try {
    await enqueue(request.new_run_id, `requested-run-retry:${request.id}`);
    await getSql()`UPDATE run_retry_requests SET status='dispatched',lease_until=NULL WHERE id=${request.id}::uuid`;
    return 1;
  } catch {
    await getSql()`UPDATE run_retry_requests SET status=${request.attempts < 3 ? "queued" : "error"},lease_until=NULL WHERE id=${request.id}::uuid`;
    if (request.attempts >= 3)
      await getSql()`UPDATE runs SET status='failed',failure_reason='The requested retry could not be queued.',finished_at=NOW() WHERE id=${request.new_run_id} AND status='queued'`;
    return 0;
  }
}
