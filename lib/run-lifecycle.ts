import { getSql } from "@/lib/db";

export class RunStopped extends Error {
  constructor() { super("This run is no longer active. No further browser actions were attempted."); }
}

/** Every browser action and outbound request rechecks the live run grant. */
export async function assertRunActive(runId: number) {
  const rows = await getSql()`SELECT r.id FROM runs r JOIN projects p ON p.id=r.project_id
    WHERE r.id=${runId} AND r.status='running' AND (r.auth_profile_id IS NULL OR EXISTS(
      SELECT 1 FROM auth_profiles a WHERE a.id=r.auth_profile_id AND a.owner_github_id=p.owner_github_id
        AND (a.project_id=p.id OR a.project_id IS NULL) AND a.revoked_at IS NULL))`;
  if (!(rows as any[]).length) throw new RunStopped();
}
