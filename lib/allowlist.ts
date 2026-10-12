import { getSql } from "@/lib/db";

/* ------------------------------------------------------------------ */
/* Invite-only access. A user can only sign in when their email is on  */
/* the allowed_emails list. The table creates itself on first use.     */
/* Emails are stored and compared lowercase. An empty list means       */
/* nobody can sign in.                                                */
/* ------------------------------------------------------------------ */

async function ensureTable() {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS allowed_emails (
      email TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

export async function isEmailAllowed(email: string): Promise<boolean> {
  const normalized = email.toLowerCase().trim();
  if (!normalized) return false;
  await ensureTable();
  const sql = getSql();
  const rows = await sql`
    SELECT 1 FROM allowed_emails WHERE email = ${normalized} LIMIT 1
  `;
  return rows.length > 0;
}
