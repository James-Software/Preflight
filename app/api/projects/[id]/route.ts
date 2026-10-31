import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getProject, updateProjectSettings } from "@/lib/schema";
import { getGithubContext, verifyRepo, GithubAuthError } from "@/lib/github";
import {
  parseProjectSettings,
  projectImage,
  ProjectSettingsError,
} from "@/lib/project-settings";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (req.headers.get("origin") !== req.nextUrl.origin)
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const owner = (await auth())?.user?.githubId;
  if (!owner)
    return NextResponse.json(
      { error: "Sign in again to edit this project." },
      { status: 401 },
    );
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0)
    return NextResponse.json(
      { error: "Project unavailable." },
      { status: 404 },
    );
  const project = await getProject(id, owner);
  if (!project)
    return NextResponse.json(
      { error: "Project unavailable." },
      { status: 404 },
    );
  try {
    if (Number(req.headers.get("content-length") || 0) > 2_200_000)
      throw new ProjectSettingsError("Choose an image up to 2 MB.");
    const form = await req.formData();
    const settings = parseProjectSettings({
      displayName: form.get("displayName"),
      appUrl: form.get("appUrl"),
      repo: form.get("repo"),
      imageMode: form.get("imageMode"),
    });
    let imageUrl = project.image_url || null;
    if (settings.imageMode === "auto") imageUrl = null;
    if (settings.imageMode === "upload") {
      const file = form.get("image");
      if (!(file instanceof File))
        throw new ProjectSettingsError("Choose an image to upload.");
      imageUrl = await projectImage(file);
    }
    let repo = settings.repo;
    if (repo !== project.repo_full_name) {
      const ctx = await getGithubContext(req);
      if (!ctx) throw new GithubAuthError();
      if (ctx.ownerGithubId && ctx.ownerGithubId !== owner)
        return NextResponse.json(
          { error: "GitHub account does not match this project." },
          { status: 403 },
        );
      const [repoOwner, repoName] = repo.split("/");
      const verified = await verifyRepo(ctx, repoOwner, repoName);
      if (!verified.ok) throw new ProjectSettingsError(verified.error);
      repo = verified.fullName;
    }
    const saved = await updateProjectSettings(id, owner, {
      displayName: settings.displayName,
      appUrl: settings.appUrl,
      repoFullName: repo,
      imageUrl,
    });
    if (!saved)
      return NextResponse.json(
        { error: "Project unavailable." },
        { status: 404 },
      );
    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/projects/${id}`, "layout");
    return NextResponse.json({ saved: true, imageUrl });
  } catch (error) {
    if (error instanceof GithubAuthError)
      return NextResponse.json(
        {
          error: "Reconnect GitHub to change the repository.",
          code: "GITHUB_REAUTH_REQUIRED",
        },
        { status: 401 },
      );
    return NextResponse.json(
      {
        error:
          error instanceof ProjectSettingsError
            ? error.message
            : "Could not save project settings. Try again.",
      },
      { status: error instanceof ProjectSettingsError ? 400 : 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (req.headers.get("origin") !== req.nextUrl.origin)
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const session = await auth();
  const owner = session?.user?.githubId;
  if (!owner)
    return NextResponse.json(
      { error: "Sign in again to delete this project." },
      { status: 401 },
    );
  if (session.user.isGuest || owner.startsWith("guest:"))
    return NextResponse.json(
      { error: "Guest workspaces cannot delete projects." },
      { status: 403 },
    );
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0)
    return NextResponse.json(
      { error: "Project unavailable." },
      { status: 404 },
    );
  try {
    const { deleteProject } = await import("@/lib/project-deletion");
    const result = await deleteProject(id, owner);
    if (!result)
      return NextResponse.json(
        { error: "Project unavailable or already deleted." },
        { status: 404 },
      );
    const { closeDeletedProjectResources } = await import(
      "@/lib/project-deletion-resources"
    );
    await closeDeletedProjectResources(result.resources);
    revalidatePath("/dashboard");
    for (const removed of result.deleted)
      revalidatePath(`/dashboard/projects/${removed}`, "layout");
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json(
      { error: "Could not delete this project. Refresh and try again." },
      { status: 500 },
    );
  }
}
