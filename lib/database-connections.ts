import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getSql } from "@/lib/db";
import { ensureSchema, getProject } from "@/lib/schema";
import { profileKey, profileOrigin } from "@/lib/auth-profile-state";
import {
  DatabaseCheckError,
  parseDatabaseChecks,
  type DatabaseCheck,
} from "@/lib/database-check-config";
import { parsePostgresUrl, postgresReader } from "@/lib/postgres-verification";

export type DatabaseConfig = {
  connectionString: string;
  checks: DatabaseCheck[];
};
export type DatabaseSnapshot = {
  id: number;
  origin: string;
  encryptedConfig: string;
};
export type DatabaseMetadata = {
  id: number;
  origin: string;
  check_count: number;
  updated_at: string;
};
function aad(owner: string, projectId: number, origin: string) {
  return Buffer.from(
    `preflight:database:v1\n${owner}\n${projectId}\n${origin}`,
  );
}
function seal(
  config: DatabaseConfig,
  owner: string,
  projectId: number,
  origin: string,
) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", profileKey(), iv);
  cipher.setAAD(aad(owner, projectId, origin));
  const data = Buffer.concat([
    cipher.update(JSON.stringify(config), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    data.toString("base64"),
  ].join(".");
}
function unseal(
  raw: string,
  owner: string,
  projectId: number,
  origin: string,
): DatabaseConfig {
  const key = profileKey();
  try {
    const [v, iv, tag, data] = raw.split(".");
    if (v !== "v1") throw new Error();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(iv, "base64"),
    );
    decipher.setAAD(aad(owner, projectId, origin));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(data, "base64")),
        decipher.final(),
      ]).toString("utf8"),
    );
  } catch {
    throw new DatabaseCheckError(
      "Could not unlock the database connection. Check the shared encryption key or reconnect the database.",
    );
  }
}
export async function listProjectDatabases(
  projectId: number,
  owner: string,
): Promise<DatabaseMetadata[]> {
  await ensureSchema();
  const rows =
    await getSql()`SELECT d.id,d.origin,d.check_count,d.updated_at FROM project_database_connections d JOIN projects p ON p.id=d.project_id WHERE p.id=${projectId} AND p.owner_github_id=${owner} AND d.revoked_at IS NULL ORDER BY d.updated_at DESC`;
  return Array.isArray(rows) ? (rows as DatabaseMetadata[]) : [];
}
export async function databaseSummary(
  projectId: number,
  owner: string,
  targetUrl: string,
): Promise<DatabaseMetadata | null> {
  const origin = profileOrigin(targetUrl);
  return (
    (await listProjectDatabases(projectId, owner)).find(
      (d) => d.origin === origin,
    ) || null
  );
}
export async function projectDatabaseSettings(
  projectId: number,
  owner: string,
  id: number,
) {
  await ensureSchema();
  const rows =
    await getSql()`SELECT d.id,d.origin,d.encrypted_config FROM project_database_connections d JOIN projects p ON p.id=d.project_id WHERE p.id=${projectId} AND p.owner_github_id=${owner} AND d.id=${id} AND d.revoked_at IS NULL`;
  const row = Array.isArray(rows)
    ? (rows[0] as
        | { id: number; origin: string; encrypted_config: string }
        | undefined)
    : null;
  if (!row)
    throw new DatabaseCheckError("This database connection is unavailable.");
  const config = unseal(row.encrypted_config, owner, projectId, row.origin);
  return { id: row.id, origin: row.origin, checks: config.checks };
}
export async function saveProjectDatabase(
  projectId: number,
  owner: string,
  input: {
    id?: number;
    origin: string;
    connectionString: string;
    checks: unknown;
  },
) {
  if (!(await getProject(projectId, owner)))
    throw new DatabaseCheckError("This project is unavailable.");
  const origin = profileOrigin(input.origin);
  let connectionString = input.connectionString.trim();
  if (!connectionString && input.id) {
    const rows =
      await getSql()`SELECT d.origin,d.encrypted_config FROM project_database_connections d JOIN projects p ON p.id=d.project_id WHERE p.id=${projectId} AND p.owner_github_id=${owner} AND d.id=${input.id} AND d.revoked_at IS NULL`;
    const row = Array.isArray(rows)
      ? (rows[0] as { origin: string; encrypted_config: string } | undefined)
      : null;
    if (!row || row.origin !== origin)
      throw new DatabaseCheckError(
        "Enter a connection URL for the selected app origin.",
      );
    connectionString = unseal(
      row.encrypted_config,
      owner,
      projectId,
      origin,
    ).connectionString;
  }
  parsePostgresUrl(connectionString);
  const checks = parseDatabaseChecks(input.checks);
  profileKey();
  const reader = await postgresReader(connectionString);
  try {
    for (const check of checks)
      await reader.read(check.query, `preflight-connection-test-${check.id}`);
  } finally {
    await reader.close();
  }
  const encrypted = seal(
    { connectionString, checks },
    owner,
    projectId,
    origin,
  );
  await ensureSchema();
  const rows =
    await getSql()`INSERT INTO project_database_connections (project_id,origin,encrypted_config,check_count)
    SELECT p.id,${origin},${encrypted},${checks.length} FROM projects p WHERE p.id=${projectId} AND p.owner_github_id=${owner}
    ON CONFLICT (project_id,origin) WHERE revoked_at IS NULL DO UPDATE SET encrypted_config=EXCLUDED.encrypted_config,check_count=EXCLUDED.check_count,revoked_at=NULL,updated_at=NOW()
    RETURNING id,origin,check_count,updated_at`;
  if (!Array.isArray(rows) || !rows.length)
    throw new DatabaseCheckError("This project is no longer available.");
  return rows[0] as DatabaseMetadata;
}
export async function disconnectProjectDatabase(
  projectId: number,
  owner: string,
  id: number,
) {
  await ensureSchema();
  const rows =
    await getSql()`UPDATE project_database_connections d SET revoked_at=NOW() FROM projects p WHERE d.id=${id} AND d.project_id=${projectId} AND p.id=d.project_id AND p.owner_github_id=${owner} AND d.revoked_at IS NULL RETURNING d.id`;
  return Array.isArray(rows) && rows.length > 0;
}
export async function databaseForRun(
  projectId: number,
  owner: string,
  targetUrl: string,
) {
  await ensureSchema();
  const origin = profileOrigin(targetUrl);
  const rows =
    await getSql()`SELECT d.id,d.origin,d.encrypted_config FROM project_database_connections d JOIN projects p ON p.id=d.project_id WHERE p.id=${projectId} AND p.owner_github_id=${owner} AND d.origin=${origin} AND d.revoked_at IS NULL`;
  const row = Array.isArray(rows)
    ? (rows[0] as
        | { id: number; origin: string; encrypted_config: string }
        | undefined)
    : null;
  if (!row)
    throw new DatabaseCheckError(
      "Connect a database for this deployment origin before enabling database verification.",
    );
  const config = unseal(row.encrypted_config, owner, projectId, origin);
  return {
    snapshot: {
      id: row.id,
      origin,
      encryptedConfig: row.encrypted_config,
    } as DatabaseSnapshot,
    checks: config.checks.map((c) => ({
      id: c.id,
      title: c.title,
      buttonLabel: c.buttonLabel,
    })),
  };
}
export async function runDatabaseConfig(runId: number) {
  const rows =
    await getSql()`SELECT r.database_snapshot,r.status,r.project_id,r.target_url,p.owner_github_id,d.revoked_at,d.id AS connection_id
    FROM runs r JOIN projects p ON p.id=r.project_id LEFT JOIN project_database_connections d ON d.id=(r.database_snapshot->>'id')::int AND d.project_id=r.project_id
    WHERE r.id=${runId}`;
  const row = Array.isArray(rows)
    ? (rows[0] as
        | {
            database_snapshot: DatabaseSnapshot | null;
            status: string;
            project_id: number;
            target_url: string;
            owner_github_id: string;
            revoked_at: string | null;
            connection_id: number | null;
          }
        | undefined)
    : null;
  if (!row?.database_snapshot) return null;
  if (row.status === "cancelled")
    throw new DatabaseCheckError(
      "The run was cancelled before database verification.",
    );
  if (!row.connection_id || row.revoked_at)
    throw new DatabaseCheckError(
      "This database connection was disconnected. Reconnect it and start a new run.",
    );
  const snapshot = row.database_snapshot;
  if (snapshot.origin !== profileOrigin(row.target_url))
    throw new DatabaseCheckError(
      "The database connection does not match the tested origin.",
    );
  return unseal(
    snapshot.encryptedConfig,
    row.owner_github_id,
    row.project_id,
    snapshot.origin,
  );
}
