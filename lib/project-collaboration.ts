import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";
import { ensureSchema, getProject } from "@/lib/schema";
import { loadGithubCredentials, savedGithubOwner } from "@/lib/github-credentials";
import { sendProjectMail, assertInviteMailConfigured, ProjectInviteError } from "@/lib/project-mail";
import { SITE_URL } from "@/lib/site";
export { ProjectInviteError } from "@/lib/project-mail";
export const PROJECT_INVITE_COOKIE = "pf_project_invite";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const tokenHash = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token) ? hash(token) : "invalid";
export type Collaborator = { user_id: string; github_login: string; email: string; joined_at: string };
export type PendingProjectInvite = { id: string; email: string; delivery: string; expires_at: string; status: string };

export async function projectCollaboration(projectId: number, actor: string) {
  const project = await getProject(projectId, actor, "member");
  if (!project || actor.startsWith("test:")) throw new ProjectInviteError("Project unavailable.");
  const members = await getSql()`SELECT user_id,github_login,email,joined_at FROM project_members WHERE project_id=${projectId} ORDER BY joined_at`;
  const invitations = project.owner_github_id === actor ? await getSql()`SELECT id,email,delivery,expires_at,
    CASE WHEN expires_at<NOW() THEN 'expired' ELSE status END AS status FROM project_invitations
    WHERE project_id=${projectId} AND status='pending' ORDER BY created_at DESC` : [];
  return { owner: project.owner_github_id === actor, members: members as Collaborator[], invitations: invitations as PendingProjectInvite[] };
}
export async function inviteProjectMember(projectId: number, actor: string, rawEmail: unknown) {
  const project = await getProject(projectId, actor);
  if (!project || actor.startsWith("test:")) throw new ProjectInviteError("Only the project owner can invite collaborators.");
  if (typeof rawEmail !== "string") throw new ProjectInviteError("Enter an email address.");
  const email = rawEmail.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s<>"@]+@[^\s<>"@]+\.[^\s<>"@]+$/.test(email)) throw new ProjectInviteError("Enter a valid email address.");
  assertInviteMailConfigured();
  const token = randomBytes(32).toString("base64url"), id = randomUUID();
  const rows = await getSql()`INSERT INTO project_invitations(id,project_id,email,token_hash)
    SELECT ${id}::uuid,${projectId},${email},${hash(token)} FROM projects p
    WHERE p.id=${projectId} AND p.owner_github_id=${actor}
      AND NOT EXISTS(SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.email=${email})
      AND (SELECT count(*) FROM project_invitations WHERE project_id=p.id AND created_at>NOW()-INTERVAL '1 hour')<30
    ON CONFLICT(project_id,email) DO UPDATE SET id=project_invitations.id,token_hash=EXCLUDED.token_hash,status='pending',delivery='sending',
      created_at=NOW(),expires_at=NOW()+INTERVAL '7 days',accepted_by=NULL,verification_sends=0,verification_attempts=0
    WHERE project_invitations.created_at<NOW()-INTERVAL '1 minute' AND project_invitations.status<>'accepted'
    RETURNING id`;
  const invite = (rows as any[])[0];
  if (!invite) throw new ProjectInviteError("This person may already have access or an invitation was just sent. Wait a minute before resending.");
  try {
    await sendProjectMail(email, "You're invited to collaborate on PreFlight", `${project.repo_full_name} invited you to collaborate on ${project.display_name || project.repo_full_name}.\n\nYou can run tests, review findings and open fix pull requests.\n\nJoin the project: ${SITE_URL}/project-invite/${token}\n\nThis invitation expires in 7 days.`, `project-invite:${invite.id}:${hash(token)}`);
    await getSql()`UPDATE project_invitations SET delivery='sent' WHERE id=${invite.id}::uuid AND token_hash=${hash(token)}`;
  } catch (error) {
    await getSql()`UPDATE project_invitations SET delivery='failed' WHERE id=${invite.id}::uuid AND token_hash=${hash(token)}`;
    throw error;
  }
}
export async function removeProjectAccess(projectId: number, actor: string, input: { inviteId?: string; userId?: string }) {
  if (actor.startsWith("test:") || !(await getProject(projectId, actor))) throw new ProjectInviteError("Only the project owner can remove access.");
  if (input.inviteId && /^[a-f0-9-]{36}$/i.test(input.inviteId)) {
    await getSql()`UPDATE project_invitations i SET status='revoked' FROM projects p WHERE i.id=${input.inviteId}::uuid AND i.project_id=${projectId} AND p.id=i.project_id AND p.owner_github_id=${actor} AND i.status='pending'`;
  } else if (typeof input.userId === "string" && input.userId.length <= 250 && input.userId !== actor) {
    // Revoke accepted invitation too, so its link cannot restore removed access.
    await getSql()`WITH removed AS (DELETE FROM project_members m USING projects p
      WHERE m.project_id=${projectId} AND p.id=m.project_id AND p.owner_github_id=${actor} AND m.user_id=${input.userId} RETURNING m.user_id)
      UPDATE project_invitations SET status='revoked' WHERE project_id=${projectId} AND accepted_by IN(SELECT user_id FROM removed)`;
  } else throw new ProjectInviteError("Choose a collaborator or pending invitation.");
}
export async function projectInviteInfo(token: string) {
  await ensureSchema();
  const rows = await getSql()`SELECT i.id,i.project_id,i.email,i.status,i.accepted_by,
    COALESCE(p.display_name,p.repo_full_name) AS project_name,p.repo_full_name,p.owner_github_id
    FROM project_invitations i JOIN projects p ON p.id=i.project_id
    WHERE i.token_hash=${tokenHash(token)} AND i.status IN ('pending','accepted') AND i.expires_at>NOW() AND i.delivery='sent'`;
  return (rows as any[])[0] || null;
}
export async function canJoinWithProjectInvite(token: string) {
  const invite = await projectInviteInfo(token);
  return invite?.status === "pending";
}
export async function hasProjectMembership(providerId: string) {
  await ensureSchema();
  const owner = await savedGithubOwner(providerId) || providerId;
  const rows = await getSql()`SELECT project_id FROM project_members WHERE user_id=${owner} LIMIT 1`;
  return (rows as any[]).length > 0;
}
async function verifiedEmail(actor: string, email: string) {
  try {
    const ctx = await loadGithubCredentials(actor);
    if (!ctx) return false;
    const response = await fetch("https://api.github.com/user/emails", { headers: { Authorization: `Bearer ${ctx.accessToken}`, Accept: "application/vnd.github+json" }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return false;
    const emails = await response.json();
    return Array.isArray(emails) && emails.some((e) => e.verified === true && typeof e.email === "string" && e.email.toLowerCase() === email);
  } catch { return false; }
}
export async function joinProject(token: string, actor: string, login: string, code?: string) {
  if (actor.startsWith("test:") || !/^[\w-]+$/.test(login)) throw new ProjectInviteError("Sign in with your GitHub account to join.");
  const invite = await projectInviteInfo(token);
  if (!invite || (invite.status === "accepted" && invite.accepted_by !== actor)) throw new ProjectInviteError("This invitation expired or was revoked. Ask the owner for a new one.");
  if (invite.status === "accepted") {
    if (await getProject(invite.project_id, actor, "member")) return { projectId: invite.project_id };
    throw new ProjectInviteError("Your project access was removed.");
  }
  let emailConfirmed = false;
  if (code !== undefined) {
    if (!/^\d{6}$/.test(code)) throw new ProjectInviteError("Enter the six-digit code from your email.");
    const verified = await getSql()`WITH budget AS (UPDATE project_invitations SET verification_attempts=verification_attempts+1
      WHERE id=${invite.id}::uuid AND status='pending' AND token_hash=${tokenHash(token)} AND verification_attempts<25 RETURNING id)
      UPDATE project_invite_verifications SET attempts=attempts+1
      WHERE invite_id IN(SELECT id FROM budget) AND user_id=${actor} AND delivery='sent' AND expires_at>NOW() AND attempts<5 RETURNING code_hash`;
    emailConfirmed = (verified as any[])[0]?.code_hash === hash(`${invite.id}:${actor}:${code}`);
    if (!emailConfirmed) throw new ProjectInviteError("That code is incorrect or expired. Request a new one.");
  } else emailConfirmed = await verifiedEmail(actor, invite.email);
  if (!emailConfirmed) {
    assertInviteMailConfigured();
    const verification = String(randomInt(100000, 1000000));
    const challengeHash = hash(`${invite.id}:${actor}:${verification}`);
    const inserted = await getSql()`INSERT INTO project_invite_verifications(invite_id,user_id,code_hash)
      VALUES(${invite.id}::uuid,${actor},${challengeHash})
      ON CONFLICT(invite_id,user_id) DO UPDATE SET code_hash=EXCLUDED.code_hash,attempts=0,delivery='sending',sent_at=NOW(),expires_at=NOW()+INTERVAL '10 minutes'
      WHERE project_invite_verifications.sent_at<NOW()-INTERVAL '1 minute' RETURNING invite_id`;
    if ((inserted as any[]).length) {
      try {
        const budget = await getSql()`UPDATE project_invitations SET verification_sends=verification_sends+1
          WHERE id=${invite.id}::uuid AND token_hash=${tokenHash(token)} AND status='pending' AND verification_sends<10 AND verification_attempts<25 RETURNING id`;
        if (!(budget as any[]).length) throw new ProjectInviteError("Too many confirmation attempts. Ask the owner for a new invitation.");
        await sendProjectMail(invite.email, "Confirm your PreFlight invitation", `Your code is ${verification}.\n\nUse it to join ${invite.project_name} as @${login}. This code expires in 10 minutes.`, `project-confirm:${randomUUID()}`);
        await getSql()`UPDATE project_invite_verifications SET delivery='sent' WHERE invite_id=${invite.id}::uuid AND user_id=${actor} AND code_hash=${challengeHash}`;
      } catch (error) {
        await getSql()`UPDATE project_invite_verifications SET delivery='failed',code_hash=NULL WHERE invite_id=${invite.id}::uuid AND user_id=${actor} AND code_hash=${challengeHash}`;
        throw error;
      }
    } else {
      const existing = await getSql()`SELECT delivery FROM project_invite_verifications WHERE invite_id=${invite.id}::uuid AND user_id=${actor}`;
      if ((existing as any[])[0]?.delivery !== "sent") throw new ProjectInviteError("Wait a minute before requesting another confirmation email.");
      return { requiresCode: true, codeAlreadySent: true };
    }
    return { requiresCode: true };
  }
  const rows = await getSql()`WITH accepted AS (
    UPDATE project_invitations SET status='accepted',accepted_by=${actor}
    WHERE id=${invite.id}::uuid AND token_hash=${tokenHash(token)} AND status='pending' AND delivery='sent' AND expires_at>NOW()
    RETURNING project_id,email
  ), added AS (INSERT INTO project_members(project_id,user_id,github_login,email)
    SELECT project_id,${actor},${login},email FROM accepted WHERE EXISTS(SELECT 1 FROM projects p WHERE p.id=accepted.project_id AND p.owner_github_id<>${actor})
    ON CONFLICT(project_id,user_id) DO NOTHING RETURNING project_id)
    SELECT project_id FROM accepted`;
  if (!(rows as any[]).length) throw new ProjectInviteError("This invitation was already used or revoked.");
  await getSql()`DELETE FROM project_invite_verifications WHERE invite_id=${invite.id}::uuid`;
  return { projectId: invite.project_id };
}
