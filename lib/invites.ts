import { randomBytes } from "node:crypto";
import { getSql } from "@/lib/db";
import { ensureAccessTables, isLoginAllowed } from "@/lib/access";

/* ------------------------------------------------------------------ */
/* Invite system. Only waitlist-approved members (referred = false)   */
/* can invite, and each gets 3 invites via a single referral link.    */
/* Referred users can use PreFlight but cannot invite others. A claim */
/* is a single atomic UPDATE (claims < 3), so a link can never be     */
/* over-claimed.                                                      */
/* ------------------------------------------------------------------ */

export const MAX_INVITES = 3;
export const INVITE_COOKIE = "pf_invite";

async function ensureInviteTables() {
  await ensureAccessTables();
  const sql = getSql();
  await sql`
    ALTER TABLE allowed_github_users
    ADD COLUMN IF NOT EXISTS referred BOOLEAN NOT NULL DEFAULT FALSE
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS referral_invites (
      code TEXT PRIMARY KEY,
      inviter_login TEXT UNIQUE NOT NULL,
      claims INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

export type InviteStatus = {
  canInvite: boolean;
  remaining: number;
  code: string | null;
};

/** Invite status for a GitHub login. Only non-referred allowlisted users can invite. */
export async function getInviteStatus(login: string): Promise<InviteStatus> {
  const l = login.toLowerCase().trim();
  if (!l) return { canInvite: false, remaining: 0, code: null };
  await ensureInviteTables();
  const sql = getSql();
  const users = await sql`
    SELECT referred FROM allowed_github_users WHERE github_login = ${l} LIMIT 1
  `;
  if (!Array.isArray(users) || users.length === 0) {
    return { canInvite: false, remaining: 0, code: null };
  }
  if ((users[0] as { referred: boolean }).referred) {
    return { canInvite: false, remaining: 0, code: null };
  }
  const rows = await sql`
    SELECT code, claims FROM referral_invites WHERE inviter_login = ${l} LIMIT 1
  `;
  if (!Array.isArray(rows) || rows.length === 0) {
    return { canInvite: true, remaining: MAX_INVITES, code: null };
  }
  const row = rows[0] as { code: string; claims: number };
  return {
    canInvite: true,
    remaining: Math.max(0, MAX_INVITES - row.claims),
    code: row.code,
  };
}

/** Returns the user's invite code, creating it on first use. Null if they cannot invite. */
export async function getOrCreateInviteCode(
  login: string
): Promise<string | null> {
  const l = login.toLowerCase().trim();
  const status = await getInviteStatus(l);
  if (!status.canInvite) return null;
  if (status.code) return status.code;
  const sql = getSql();
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = randomBytes(9).toString("base64url");
    try {
      await sql`
        INSERT INTO referral_invites (code, inviter_login)
        VALUES (${code}, ${l})
        ON CONFLICT (inviter_login) DO NOTHING
      `;
      break;
    } catch {
      // Rare code collision; retry with a fresh code.
    }
  }
  const rows = await sql`
    SELECT code FROM referral_invites WHERE inviter_login = ${l} LIMIT 1
  `;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Could not create invite code");
  }
  return (rows[0] as { code: string }).code;
}

export type InviteInfo = {
  inviterLogin: string;
  remaining: number;
};

/** Validate an invite code for display: real, inviter still allowed, claims left. */
export async function getInviteByCode(
  code: string
): Promise<InviteInfo | null> {
  const c = code.trim();
  if (!c) return null;
  await ensureInviteTables();
  const sql = getSql();
  const rows = await sql`
    SELECT inviter_login, claims FROM referral_invites WHERE code = ${c} LIMIT 1
  `;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const row = rows[0] as { inviter_login: string; claims: number };
  if (row.claims >= MAX_INVITES) return null;
  if (!(await isLoginAllowed(row.inviter_login))) return null;
  return {
    inviterLogin: row.inviter_login,
    remaining: MAX_INVITES - row.claims,
  };
}

/**
 * Claim an invite for a GitHub login. Atomic: the UPDATE only succeeds when
 * claims < 3, so concurrent claims can never exceed the cap. On success the
 * login is allowlisted with referred = true and dropped from the waitlist.
 */
export async function claimInvite(
  code: string,
  login: string
): Promise<boolean> {
  const c = code.trim();
  const l = login.toLowerCase().trim();
  if (!c || !l) return false;
  await ensureInviteTables();
  const sql = getSql();
  const updated = await sql`
    UPDATE referral_invites
    SET claims = claims + 1
    WHERE code = ${c} AND claims < ${MAX_INVITES}
    RETURNING inviter_login
  `;
  if (!Array.isArray(updated) || updated.length === 0) return false;
  const inviter = (updated[0] as { inviter_login: string }).inviter_login;
  // The inviter must still be allowlisted, and nobody invites themselves.
  if (inviter.toLowerCase() === l || !(await isLoginAllowed(inviter))) {
    await sql`UPDATE referral_invites SET claims = claims - 1 WHERE code = ${c}`;
    return false;
  }
  await sql`
    INSERT INTO allowed_github_users (github_login, referred)
    VALUES (${l}, TRUE)
    ON CONFLICT (github_login) DO NOTHING
  `;
  await sql`DELETE FROM waitlist_github WHERE github_login = ${l}`;
  return true;
}
