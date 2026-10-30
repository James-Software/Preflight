import { projectGithubContext, ProjectGithubError } from "@/lib/project-github";
import { saveFixGithubGrant } from "@/lib/fix-github-grant";
import { tasks } from "@trigger.dev/sdk";
import { getTriggerClientConfig } from "@/lib/trigger-client";
import { GithubRenewalUnavailable } from "@/lib/github-credentials";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getProject, getRunReport } from "@/lib/schema";
import { GithubAuthError } from "@/lib/github";
import {
  acquireFixGroup,
  completeFixGroup,
  deleteFindings,
  FixActionError,
  parseFindingIds,
  reserveFixGroup,
  releaseInvalidFixGroup,
  releaseFixGroupLease,
} from "@/lib/fix-groups";
import { FixPatchError, openFixPullRequest } from "@/lib/fix-pull-request";

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> },
) {
  if (req.headers.get("origin") !== req.nextUrl.origin)
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const owner = (await auth())?.user?.githubId;
  if (!owner)
    return NextResponse.json(
      { error: "Sign in again to manage these findings." },
      { status: 401 },
    );
  const { id, runId } = await params;
  const projectId = Number(id),
    runNumber = Number(runId);
  if (![projectId, runNumber].every((n) => Number.isSafeInteger(n) && n > 0))
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  try {
    const project = await getProject(projectId, owner, "member");
    const report = project && (await getRunReport(projectId, runNumber, owner));
    if (!project || !report)
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    const body = await req.json().catch(() => null);
    if (!body || !["delete", "open-pr"].includes(body.action))
      throw new FixActionError("Choose a valid action.", 400);
    if (owner.startsWith("guest:") && body.action === "open-pr")
      return NextResponse.json({ error: "Opening pull requests requires your own GitHub-connected project. You can review and copy this demo's findings." }, { status: 403 });
    const ids = parseFindingIds(body.findingIds);
    if (ids.some((id) => !report.findings.some((f) => f.id === id)))
      throw new FixActionError(
        "Some selected findings are no longer available.",
      );
    const path = `/dashboard/projects/${projectId}/runs/${runNumber}`;
    if (body.action === "delete") {
      await deleteFindings(owner, projectId, runNumber, ids);
      revalidatePath(path);
      revalidatePath(`/dashboard/projects/${projectId}`);
      return NextResponse.json({ deletedIds: ids });
    }
    if (
      typeof body.groupId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        body.groupId,
      )
    )
      throw new FixActionError("Invalid PR group. Refresh and try again.", 400);
    const ctx = await projectGithubContext(req, project, owner);
    if (!ctx)
      throw new FixActionError(
        "Your GitHub session expired. Sign in again to open a PR.",
        401,
      );
    if (
      ids.length > 10 &&
      ids.some(
        (id) => !report.findings.find((f) => f.id === id)?.patch_diff?.trim(),
      )
    )
      throw new FixActionError(
        "Prepare up to 10 fixes per PR. Select a smaller group.",
        400,
      );
    const group = await reserveFixGroup(
      owner,
      projectId,
      runNumber,
      ids,
      body.groupId,
    );
    if (group.pr_url)
      return NextResponse.json({
        prUrl: group.pr_url,
        prNumber: group.pr_number,
      });
    const fixes = ids.map((id) => report.findings.find((f) => f.id === id)!);
    if (fixes.some((f) => !f.patch_diff?.trim())) {
      const config = getTriggerClientConfig();
      try {
        await acquireFixGroup(group.id);
      } catch (error) {
        if (error instanceof FixActionError)
          return NextResponse.json(
            { queued: true, groupId: group.id },
            { status: 202 },
          );
        throw error;
      }
      try {
        await saveFixGithubGrant(group.id, owner, ctx);
        await tasks.trigger(
          "prepare-fix-pr",
          { groupId: group.id, runId: runNumber, projectId, owner },
          config,
        );
      } catch {
        await releaseFixGroupLease(group.id);
        throw new FixActionError(
          "Could not queue fix preparation. Check the Trigger.dev deployment and retry this group.",
          503,
        );
      }
      revalidatePath(path);
      return NextResponse.json(
        { queued: true, groupId: group.id },
        { status: 202 },
      );
    }
    await acquireFixGroup(group.id);
    let pr;
    try {
      pr = await openFixPullRequest(
        ctx,
        report.run.repo_full_name || project.repo_full_name,
        group.branch,
        fixes,
        new URL(path, req.nextUrl.origin).href,
        fixes.some((f) => f.confidence === "proposed"),
      );
    } catch (error) {
      if (error instanceof FixPatchError)
        await releaseInvalidFixGroup(group.id);
      if (error instanceof GithubAuthError)
        return NextResponse.json(
          {
            error: "Reconnect GitHub to resume this PR group.",
            code: "GITHUB_REAUTH_REQUIRED",
            groupId: group.id,
          },
          { status: 401 },
        );
      // Reservation stays durable. Retrying resumes the same group/branch, including after a timeout.
      revalidatePath(path);
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Could not open this PR. Retry this group.",
          ...(error instanceof FixPatchError ? {} : { groupId: group.id }),
        },
        { status: error instanceof FixPatchError ? 409 : 502 },
      );
    } finally {
      await releaseFixGroupLease(group.id);
    }
    await completeFixGroup(group.id, pr.html_url, pr.number);
    revalidatePath(path);
    return NextResponse.json({ prUrl: pr.html_url, prNumber: pr.number });
  } catch (error) {
    if (error instanceof ProjectGithubError)
      return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof GithubRenewalUnavailable)
      return NextResponse.json({ error: error.message }, { status: 503 });
    if (error instanceof FixActionError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    console.error(
      "Finding action failed",
      error instanceof Error ? error.name : "unknown",
    );
    return NextResponse.json(
      {
        error:
          "Could not save this action. Refresh the report and retry; existing PR groups will be reused.",
      },
      { status: 500 },
    );
  }
}
