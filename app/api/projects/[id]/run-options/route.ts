import { projectGithubContext, ProjectGithubError } from "@/lib/project-github";
import { databaseSummary } from "@/lib/database-connections";
import { GithubRenewalUnavailable } from "@/lib/github-credentials";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getProject } from "@/lib/schema";
import { GithubAuthError } from "@/lib/github";
import { listAuthProfiles } from "@/lib/auth-profiles";
import {
  listRunTargets,
  parseRunTarget,
  resolveRunTarget,
  RunTargetError,
} from "@/lib/run-targets";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const owner = (await auth())?.user?.githubId;
  if (!owner)
    return NextResponse.json(
      {
        error: "Sign in again to configure a run.",
        code: "GITHUB_REAUTH_REQUIRED",
      },
      { status: 401 },
    );
  const { id } = await params;
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0)
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  try {
    const project = await getProject(Number(id), owner, "member");
    if (!project)
      return NextResponse.json(
        { error: "Project not found." },
        { status: 404 },
      );
    const ctx = await projectGithubContext(req, project, owner);
    if (!ctx)
      return NextResponse.json(
        {
          error: "Reconnecting GitHub is required.",
          code: "GITHUB_REAUTH_REQUIRED",
        },
        { status: 401 },
      );
    const query = req.nextUrl.searchParams;
    const guest = owner.startsWith("guest:");
    if (query.has("type")) {
      const target = parseRunTarget({
        type: query.get("type"),
        ref: query.get("ref"),
        number: Number(query.get("number")),
      });
      if (guest && (target.type !== "branch" || target.ref !== "main"))
        return NextResponse.json({ error: "The guest demo uses the example app's main branch." }, { status: 400 });
      const resolved = await resolveRunTarget(
        ctx,
        project.repo_full_name,
        target,
        project.app_url,
      );
      return NextResponse.json({
        target: resolved,
        database: await databaseSummary(project.id, project.owner_github_id, resolved.url),
      });
    }
    const [targets, profiles] = await Promise.all([
      listRunTargets(ctx, project.repo_full_name),
      listAuthProfiles(project.owner_github_id, project.id),
    ]);
    return NextResponse.json({ ...targets,
      ...(guest ? { options: targets.options.filter(t => t.type === "branch" && t.ref === "main") } : {}),
      profiles: guest ? [] : profiles, canManageProfiles: project.owner_github_id === owner });
  } catch (error) {
    return NextResponse.json(
      {
        ...(error instanceof GithubAuthError
          ? { code: "GITHUB_REAUTH_REQUIRED" }
          : {}),
        error:
          error instanceof GithubRenewalUnavailable
            ? error.message
            : error instanceof GithubAuthError
              ? "GitHub session expired. Sign in again."
              : error instanceof RunTargetError || error instanceof ProjectGithubError
                ? error.message
                : "Could not load run options. Try again.",
      },
      {
        status:
          error instanceof GithubAuthError
            ? 401
            : error instanceof GithubRenewalUnavailable
              ? 503
              : 502,
      },
    );
  }
}
