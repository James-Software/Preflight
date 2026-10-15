import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk";
import { auth } from "@/auth";
import { getProject, listRuns, createRun } from "@/lib/schema";
import { getSql } from "@/lib/db";
import {
  getGithubContext,
  resolveDefaultBranchPreview,
  GithubAuthError,
} from "@/lib/github";

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

/**
 * POST /api/projects/[id]/runs — creates a run and fires the swarm.
 * The run target is the project's App URL when set; otherwise the default
 * branch's latest successful preview deployment is resolved right here
 * (the background task has no GitHub token of its own).
 */
export async function POST(
  req: NextRequest,
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

  let targetUrl = project.app_url;
  if (!targetUrl) {
    const ctx = await getGithubContext(req);
    if (!ctx) {
      return NextResponse.json(
        {
          error: "GitHub session expired. Please log in again.",
          tokenMissing: true,
        },
        { status: 401 }
      );
    }
    const [owner, repo] = project.repo_full_name.split("/");
    let preview: { url: string; branch: string } | null;
    try {
      preview = await resolveDefaultBranchPreview(ctx, owner, repo);
    } catch (e) {
      if (e instanceof GithubAuthError) {
        return NextResponse.json(
          {
            error: "GitHub session expired. Please log in again.",
            tokenExpired: true,
          },
          { status: 401 }
        );
      }
      throw e;
    }
    if (!preview) {
      return NextResponse.json(
        {
          error:
            "No preview deployment found for the default branch. Connect a hosting provider (Vercel, Netlify, …) to this repo, or set an App URL on the project.",
        },
        { status: 400 }
      );
    }
    targetUrl = preview.url;
  }

  const run = await createRun(project.id, targetUrl);
  // Fire and forget: the task updates the run row as it progresses.
  await tasks.trigger("run-swarm", { runId: run.id, targetUrl });
  return NextResponse.json({ run });
}
