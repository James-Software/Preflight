import { NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk";
import { auth } from "@/auth";
import { getProject, listRuns, createRun } from "@/lib/schema";
import { getSql } from "@/lib/db";

async function findingsCount(runId: number): Promise<number> {
  const rows = await getSql()`
    SELECT COUNT(*)::int AS c FROM findings WHERE run_id = ${runId}
  `;
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  return (rows[0] as { c: number }).c ?? 0;
}

/** GET /api/projects/[id]/runs — runs with findings counts (for polling). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const githubId = session?.user?.githubId;
  if (!githubId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const project = await getProject(Number(id), githubId);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const runs = await listRuns(project.id);
  const withCounts = await Promise.all(
    runs.map(async (r) => ({ ...r, findingsCount: await findingsCount(r.id) }))
  );
  return NextResponse.json({ runs: withCounts });
}

/** POST /api/projects/[id]/runs — creates a run and fires the swarm. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const githubId = session?.user?.githubId;
  if (!githubId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const project = await getProject(Number(id), githubId);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const run = await createRun(project.id);
  // Fire and forget: the task updates the run row as it progresses.
  await tasks.trigger("run-swarm", { runId: run.id });
  return NextResponse.json({ run });
}
