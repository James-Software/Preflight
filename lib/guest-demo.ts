import { createHash, randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { demoDatabaseCopy } from "@/lib/database-connections";

export const DEMO_REPO = "James-Software/Preflight-Example";
export const DEMO_ORIGIN = "https://preflight-example.vercel.app";
export const GUEST_MAX_AGE = 30 * 24 * 60 * 60;
export const guestCookieName = () => process.env.NODE_ENV === "production" ? "__Host-preflight-guest" : "preflight-guest";
export const demoLinkHash = (code: string) => /^[A-Za-z0-9_-]{43}$/.test(code) ? createHash("sha256").update(code).digest("hex") : "invalid";
export class GuestDemoError extends Error {}

/** Check the live grant, membership and fixed template on every authenticated request. */
export async function activeGuest(actor: string, projectId: number) {
  if (!/^guest:[a-f0-9-]{36}$/.test(actor) || !Number.isSafeInteger(projectId)) return null;
  await ensureSchema();
  const rows = await getSql()`SELECT s.actor_id,s.project_id,s.link_hash,s.expires_at FROM guest_demo_sessions s
    JOIN guest_demo_links l ON l.token_hash=s.link_hash JOIN projects p ON p.id=s.project_id
    JOIN projects t ON t.id=l.template_project_id JOIN project_members m ON m.project_id=p.id AND m.user_id=s.actor_id
    WHERE s.actor_id=${actor} AND s.project_id=${projectId} AND s.revoked_at IS NULL AND s.expires_at>NOW()
      AND l.revoked_at IS NULL AND l.expires_at>NOW() AND t.repo_full_name=${DEMO_REPO}
      AND p.repo_full_name=t.repo_full_name AND p.owner_github_id=t.owner_github_id
      AND rtrim(p.app_url,'/')=${DEMO_ORIGIN} AND rtrim(t.app_url,'/')=${DEMO_ORIGIN}`;
  return (rows as any[])[0] || null;
}

export async function enterGuestDemo(code: string, previous?: { actor: string; projectId: number }) {
  const hash = demoLinkHash(code);
  if (hash === "invalid") throw new GuestDemoError("This demo invitation is unavailable or has expired.");
  await ensureSchema();
  const sql = getSql();
  if (previous) {
    const current = await activeGuest(previous.actor, previous.projectId);
    if (current?.link_hash === hash) return current;
  }
  const templates = await sql`SELECT p.id,p.owner_github_id,p.app_url,l.expires_at FROM guest_demo_links l
    JOIN projects p ON p.id=l.template_project_id WHERE l.token_hash=${hash} AND l.revoked_at IS NULL AND l.expires_at>NOW()
      AND p.repo_full_name=${DEMO_REPO} AND rtrim(p.app_url,'/')=${DEMO_ORIGIN}`;
  const template = (templates as any[])[0];
  if (!template) throw new GuestDemoError("This demo invitation is unavailable or has expired.");
  const actor = `guest:${randomUUID()}`;
  const ids = await sql`SELECT nextval(pg_get_serial_sequence('projects','id'))::int AS id`;
  const projectId = (ids as any[])[0].id;
  const database = await demoDatabaseCopy(template.id, projectId, template.owner_github_id, DEMO_ORIGIN);
  // One statement makes the private project, membership and guest grant atomic.
  const rows = await sql`WITH p AS (
    INSERT INTO projects(id,owner_github_id,app_url,repo_full_name,display_name,image_url,screenshot_retention_days)
    SELECT ${projectId},t.owner_github_id,t.app_url,t.repo_full_name,'Preflight-Example',t.image_url,t.screenshot_retention_days
      FROM projects t JOIN guest_demo_links l ON l.template_project_id=t.id
      WHERE t.id=${template.id} AND l.token_hash=${hash} AND l.revoked_at IS NULL AND l.expires_at>NOW()
        AND t.repo_full_name=${DEMO_REPO} AND rtrim(t.app_url,'/')=${DEMO_ORIGIN}
        AND t.owner_github_id=${template.owner_github_id}
        AND EXISTS(SELECT 1 FROM project_database_connections d WHERE d.id=${database.sourceId} AND d.project_id=t.id AND d.revoked_at IS NULL)
    RETURNING id
  ), member AS (
    INSERT INTO project_members(project_id,user_id,github_login,email)
    SELECT id,${actor},'judge-guest','' FROM p RETURNING project_id
  ), db AS (
    INSERT INTO project_database_connections(project_id,origin,encrypted_config,check_count)
    SELECT project_id,${DEMO_ORIGIN},${database.encrypted},${database.checkCount} FROM member RETURNING project_id
  ) INSERT INTO guest_demo_sessions(actor_id,link_hash,project_id,expires_at)
    SELECT ${actor},${hash},project_id,LEAST(${template.expires_at}::timestamptz,NOW()+INTERVAL '30 days') FROM db
    RETURNING actor_id,project_id,link_hash,expires_at`;
  const guest = (rows as any[])[0];
  if (!guest) throw new GuestDemoError("This demo invitation is unavailable or has expired.");
  return guest;
}
