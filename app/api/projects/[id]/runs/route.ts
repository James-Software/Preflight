import { profileForRun } from "@/lib/auth-profiles";
import { ProfileError } from "@/lib/auth-profile-state";
import {
  parseRunTarget,
  resolveRunTarget,
  RunTargetError,
} from "@/lib/run-targets";
import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk";
import { auth } from "@/auth";
import { getTriggerClientConfig, swarmStartError } from "@/lib/trigger-client";
import { getProject, listRuns, createRun, updateRunStatus } from "@/lib/schema";
import {
  getGithubContext,
  resolveDefaultBranchPreview,
  GithubAuthError,
} from "@/lib/github";

/** GET /api/projects/[id]/runs — runs with findings counts (for polling). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const githubId = session?.user?.githubId;
  if (!githubId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0)
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const project = await getProject(Number(id), githubId);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const runs = await listRuns(project.id);
  return NextResponse.json({ runs });
}

/**
 * POST /api/projects/[id]/runs — creates a run and fires the swarm.
 * The run target is the project's App URL when set; otherwise the default
 * branch's latest successful preview deployment is resolved right here
 * (the background task has no GitHub token of its own).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (req.headers.get("origin") !== new URL(req.url).origin)
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const session = await auth();
  const githubId = session?.user?.githubId;
  if (!githubId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0)
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const project = await getProject(Number(id), githubId);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let clientConfig;
  try {
    clientConfig = getTriggerClientConfig();
  } catch (error) {
    return NextResponse.json(
      { error: swarmStartError(error) },
      { status: 503 },
    );
  }

  let body;
  try {
    const raw = await req.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json(
      { error: "Choose valid run options." },
      { status: 400 },
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return NextResponse.json(
      { error: "Choose valid run options." },
      { status: 400 },
    );
  if (
    body.profileId != null &&
    (!Number.isSafeInteger(body.profileId) || body.profileId <= 0)
  )
    return NextResponse.json(
      { error: "Choose a valid authentication profile." },
      { status: 400 },
    );
  let targetRef: string | undefined, targetSha: string | undefined;
  let targetUrl = project.app_url;
  if (body.target !== undefined) {
    try {
      const selected = parseRunTarget(body.target);
      const ctx = await getGithubContext(req);
      if (!ctx)
        return NextResponse.json(
          { error: "GitHub session expired. Sign in again." },
          { status: 401 },
        );
      const resolved = await resolveRunTarget(
        ctx,
        project.repo_full_name,
        selected,
        project.app_url,
      );
      targetUrl = resolved.url;
      targetRef = resolved.ref;
      targetSha = resolved.sha;
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof RunTargetError
              ? error.message
              : error instanceof GithubAuthError
                ? "GitHub session expired. Sign in again."
                : "Could not resolve this deployment. Try again.",
        },
        { status: 400 },
      );
    }
  }
  if (!targetUrl) {
    const ctx = await getGithubContext(req);
    if (!ctx) {
      return NextResponse.json(
        {
          error: "GitHub session expired. Please log in again.",
          tokenMissing: true,
        },
        { status: 401 },
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
          { status: 401 },
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
        { status: 400 },
      );
    }
    targetUrl = preview.url;
  }

  let profile;
  if (body.profileId != null) {
    try {
      profile = await profileForRun(githubId, body.profileId, targetUrl!);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof ProfileError
              ? error.message
              : "Could not load this profile. Try again.",
        },
        { status: 400 },
      );
    }
  }
  let run;
  try {
    run = await createRun(project.id, targetUrl, {
      targetRef,
      targetSha,
      profile,
    });
  } catch (e) {
    console.error("createRun failed", e);
    return NextResponse.json(
      { error: "Could not create the run. Try again." },
      { status: 500 },
    );
  }
  // Fire and forget: the task updates the run row as it progresses.
  // Surface trigger failures instead of a generic 500 so the real cause
  // (e.g. tasks not deployed to Trigger.dev) is visible.
  try {
    await tasks.trigger("run-swarm", { runId: run.id, targetUrl }, undefined, {
      clientConfig,
    });
  } catch (e) {
    console.error("tasks.trigger(run-swarm) failed", e);
    await updateRunStatus(run.id, "failed").catch(() => {});
    return NextResponse.json({ error: swarmStartError(e) }, { status: 500 });
  }
  return NextResponse.json({ run });
}
