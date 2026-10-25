import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  createAuthProfile,
  listAuthProfiles,
  revokeAuthProfile,
  profileProject,
  assignAuthProfile,
} from "@/lib/auth-profiles";
import { ProfileError } from "@/lib/auth-profile-state";

export async function GET(req: NextRequest) {
  const owner = (await auth())?.user?.githubId;
  if (!owner)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const projectId = Number(req.nextUrl.searchParams.get("projectId"));
    return NextResponse.json(
      { profiles: await listAuthProfiles(owner, projectId) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Project unavailable." },
      { status: 404 },
    );
  }
}
async function change(req: NextRequest, remove: boolean) {
  if (req.headers.get("origin") !== req.nextUrl.origin)
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const owner = (await auth())?.user?.githubId;
  if (!owner)
    return NextResponse.json(
      { error: "Sign in again to manage profiles." },
      { status: 401 },
    );
  try {
    const projectId = Number(req.nextUrl.searchParams.get("projectId"));
    await profileProject(owner, projectId);
    const raw = await req.text();
    if (raw.length > 160_000)
      return NextResponse.json(
        { error: "Profile data is too large." },
        { status: 413 },
      );
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "Use valid JSON for the profile." },
        { status: 400 },
      );
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new ProfileError("Complete the profile fields.");
    if (remove) {
      if (!Number.isSafeInteger(body.id) || body.id <= 0)
        throw new ProfileError("Select a valid profile.");
      if (!(await revokeAuthProfile(owner, body.id, projectId)))
        return NextResponse.json(
          { error: "Profile not found." },
          { status: 404 },
        );
      revalidatePath(`/dashboard/projects/${projectId}/profiles`);
      return NextResponse.json({ removed: true });
    }
    if (body.action === "assign") {
      if (!Number.isSafeInteger(body.id) || body.id <= 0)
        throw new ProfileError("Choose a valid profile.");
      const profile = await assignAuthProfile(owner, projectId, body.id);
      revalidatePath(`/dashboard/projects/${projectId}/profiles`);
      return NextResponse.json({ profile });
    }
    for (const key of ["name", "origin", "session", "headers"])
      if (typeof body[key] !== "string")
        throw new ProfileError("Complete the profile fields.");
    for (const key of ["verificationPath", "verificationText"])
      if (body[key] !== undefined && typeof body[key] !== "string")
        throw new ProfileError("Use text for the verification fields.");
    const profile = await createAuthProfile(owner, body, projectId);
    revalidatePath(`/dashboard/projects/${projectId}/profiles`);
    return NextResponse.json({ profile }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof ProfileError
            ? error.message
            : "Could not save this profile. Check the input and try again.",
      },
      { status: error instanceof ProfileError ? 400 : 500 },
    );
  }
}
export async function POST(req: NextRequest) {
  return change(req, false);
}
export async function DELETE(req: NextRequest) {
  return change(req, true);
}
