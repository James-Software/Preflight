import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getProject, cancelRun } from "@/lib/schema";

/**
 * POST /api/projects/[id]/runs/[runId]/cancel — stops an in-flight run.
 * The swarm parent checks for cancellation on pickup, so a cancelled run
 * never spends Browserbase/LLM money even if its task fires afterwards.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  if (req.headers.get("origin") !== req.nextUrl.origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await auth();
  const githubId = session?.user?.githubId;
  if (!githubId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, runId } = await params;
  const project = await getProject(Number(id), githubId, "member");
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const cancelled = await cancelRun(Number(runId), project.id);
  if (!cancelled) {
    return NextResponse.json(
      { error: "Run is not active." },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true });
}
