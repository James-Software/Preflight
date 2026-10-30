import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createRunAgentGrant, revokeRunAgentGrants, hasRunAgentGrants, AgentAccessError } from "@/lib/run-agent-access";
export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
type Context = { params: Promise<{ id: string; runId: string }> };
async function handle(req: NextRequest, context: Context, action: "read" | "create" | "revoke") {
  if (action !== "read" && req.headers.get("origin") !== req.nextUrl.origin)
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers });
  const user = (await auth())?.user;
  if (!user?.githubId || (!user.githubLogin && !user.isGuest) || user.isTestUser)
    return NextResponse.json({ error: "Sign in with GitHub to connect an agent." }, { status: 401, headers });
  const params = await context.params, projectId = Number(params.id), runId = Number(params.runId);
  try {
    if (action === "read") return NextResponse.json({ active: await hasRunAgentGrants(projectId, runId, user.githubId) }, { headers });
    if (action === "create") return NextResponse.json(await createRunAgentGrant(projectId, runId, user.githubId, user.githubLogin || "judge-guest"), { headers });
    await revokeRunAgentGrants(projectId, runId, user.githubId);
    return NextResponse.json({ revoked: true }, { headers });
  } catch (error) { return NextResponse.json({ error: error instanceof AgentAccessError ? error.message : "Could not prepare agent access. Try again." }, { status: error instanceof AgentAccessError ? 404 : 500, headers }); }
}
export async function GET(req: NextRequest, context: Context) { return handle(req, context, "read"); }
export async function POST(req: NextRequest, context: Context) { return handle(req, context, "create"); }
export async function DELETE(req: NextRequest, context: Context) { return handle(req, context, "revoke"); }
