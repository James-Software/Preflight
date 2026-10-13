import { getSql } from "@/lib/db";

/* ------------------------------------------------------------------ */
/* Invite-only access keyed on GitHub username (login), NOT email.    */
/* The GitHub App user flow does not return private emails, so email  */
/* can never be a reliable gate. A denied sign-in automatically joins  */
/* the waitlist. Tables create themselves on first use.                */
/* ------------------------------------------------------------------ */

export const ADMIN_LOGIN = "james-software";

export function isAdminLogin(login: string | undefined | null): boolean {
  return (login ?? "").toLowerCase().trim() === ADMIN_LOGIN;
}

export type WaitlistEntry = {
  github_login: string;
  github_id: string | null;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
};

async function ensureAccessTables() {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS allowed_github_users (
      github_login TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS waitlist_github (
      github_login TEXT PRIMARY KEY,
      github_id TEXT,
      name TEXT,
      avatar_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

const norm = (login: string) => login.toLowerCase().trim();

export async function isLoginAllowed(login: string): Promise<boolean> {
  const l = norm(login);
  if (!l) return false;
  await ensureAccessTables();
  const rows = await getSql()`
    SELECT 1 FROM allowed_github_users WHERE github_login = ${l} LIMIT 1
  `;
  return Array.isArray(rows) && rows.length > 0;
}

export async function addToWaitlist(entry: {
  login: string;
  githubId: string | null;
  name: string | null;
  avatarUrl: string | null;
}): Promise<void> {
  const l = norm(entry.login);
  if (!l) return;
  await ensureAccessTables();
  await getSql()`
    INSERT INTO waitlist_github (github_login, github_id, name, avatar_url)
    VALUES (${l}, ${entry.githubId}, ${entry.name}, ${entry.avatarUrl})
    ON CONFLICT (github_login) DO UPDATE SET
      name = EXCLUDED.name,
      avatar_url = EXCLUDED.avatar_url
  `;
}

export async function listWaitlist(): Promise<WaitlistEntry[]> {
  await ensureAccessTables();
  const rows = await getSql()`
    SELECT github_login, github_id, name, avatar_url, created_at
    FROM waitlist_github
    ORDER BY created_at ASC
  `;
  if (!Array.isArray(rows)) return [];
  return rows as WaitlistEntry[];
}

export async function approveLogin(login: string): Promise<void> {
  const l = norm(login);
  if (!l) return;
  await ensureAccessTables();
  const sql = getSql();
  await sql`
    INSERT INTO allowed_github_users (github_login)
    VALUES (${l})
    ON CONFLICT DO NOTHING
  `;
  await sql`DELETE FROM waitlist_github WHERE github_login = ${l}`;
}
