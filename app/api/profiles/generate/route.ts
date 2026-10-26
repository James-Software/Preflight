import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { ProfileError } from "@/lib/auth-profile-state";
import { profileProject } from "@/lib/auth-profiles";
import { getTriggerClientConfig } from "@/lib/trigger-client";
import {
  getProfileGeneration,
  startProfileGeneration,
  resumeProfileGeneration,
  cancelProfileGeneration,
  failGenerationQueue,
} from "@/lib/profile-generation";

export const runtime = "nodejs";
export const maxDuration = 60;
const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};
async function handle(
  req: NextRequest,
  action: "read" | "start" | "resume" | "cancel",
) {
  if (action !== "read" && req.headers.get("origin") !== req.nextUrl.origin)
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403, headers },
    );
  try {
    const owner = (await auth())?.user?.githubId;
    if (!owner)
      return NextResponse.json(
        { error: "Sign in again to create a profile." },
        { status: 401, headers },
      );
    const projectId = Number(req.nextUrl.searchParams.get("projectId"));
    await profileProject(owner, projectId);
    if (action === "read")
      return NextResponse.json(
        {
          generation: await getProfileGeneration(
            owner,
            projectId,
            req.nextUrl.searchParams.get("id") || undefined,
          ),
        },
        { headers },
      );
    const text = await req.text();
    if (text.length > 5000)
      throw new ProfileError("Profile settings are too large.");
    let input;
    try {
      input = JSON.parse(text);
    } catch {
      throw new ProfileError("Enter valid profile settings.");
    }
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new ProfileError("Enter valid profile settings.");
    if (action !== "start" && typeof input.id !== "string")
      throw new ProfileError("Choose a profile setup.");
    if (action === "cancel") {
      await cancelProfileGeneration(owner, projectId, input.id);
      return NextResponse.json({ generation: null }, { headers });
    }
    // Resolve queue configuration before allocating a paid browser.
    const config = getTriggerClientConfig();
    const { tasks } = await import("@trigger.dev/sdk");
    let id: string;
    if (action === "start")
      id = (await startProfileGeneration(owner, projectId, input)).id;
    else {
      await resumeProfileGeneration(owner, projectId, input.id);
      id = input.id;
    }
    try {
      await tasks.trigger(
        "generate-auth-profile",
        { owner, projectId, captureId: id },
        config,
      );
    } catch {
      await failGenerationQueue(owner, projectId, id);
      throw new ProfileError(
        "Could not start the profile agent. Check the Trigger.dev deployment, or use Sign in with browser below.",
      );
    }
    revalidatePath(`/dashboard/projects/${projectId}/profiles`);
    return NextResponse.json(
      { generation: await getProfileGeneration(owner, projectId, id) },
      { status: 202, headers },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof ProfileError
            ? error.message
            : "Could not complete automatic profile setup. Try again or use Sign in with browser.",
      },
      { status: error instanceof ProfileError ? 400 : 500, headers },
    );
  }
}
export async function GET(req: NextRequest) {
  return handle(req, "read");
}
export async function POST(req: NextRequest) {
  return handle(req, "start");
}
export async function PATCH(req: NextRequest) {
  return handle(req, "resume");
}
export async function DELETE(req: NextRequest) {
  return handle(req, "cancel");
}
