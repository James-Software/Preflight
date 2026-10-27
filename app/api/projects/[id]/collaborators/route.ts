import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { projectCollaboration, inviteProjectMember, removeProjectAccess, ProjectInviteError } from "@/lib/project-collaboration";
export const runtime = "nodejs";
export const maxDuration = 30;
const headers = { "Cache-Control": "no-store" };
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = (await auth())?.user;
  if (!user?.githubId || user.isTestUser) return NextResponse.json({ error: "Sign in to view collaborators." }, { status: 401, headers });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Project unavailable." }, { status: 404, headers });
  try { return NextResponse.json(await projectCollaboration(id, user.githubId), { headers }); }
  catch { return NextResponse.json({ error: "Project unavailable." }, { status: 404, headers }); }
}
async function change(req: NextRequest, params: Promise<{ id: string }>, remove: boolean) {
  if (req.headers.get("origin") !== req.nextUrl.origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers });
  const user = (await auth())?.user;
  if (!user?.githubId || user.isTestUser) return NextResponse.json({ error: "Sign in to manage collaborators." }, { status: 401, headers });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Project unavailable." }, { status: 404, headers });
  try {
    const raw = await req.text();
    if (raw.length > 2000) throw new ProjectInviteError("Choose one invitation or collaborator.");
    const input = JSON.parse(raw);
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new ProjectInviteError("Choose a valid action.");
    if (remove) await removeProjectAccess(id, user.githubId, input);
    else await inviteProjectMember(id, user.githubId, input.email);
    return NextResponse.json(await projectCollaboration(id, user.githubId), { headers });
  } catch (error) { return NextResponse.json({ error: error instanceof ProjectInviteError ? error.message : "Could not update collaborators. Try again." }, { status: 400, headers }); }
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) { return change(req, params, false); }
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) { return change(req, params, true); }
