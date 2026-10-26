import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { ProfileError } from "@/lib/auth-profile-state";
import { profileProject } from "@/lib/auth-profiles";
import { getTriggerClientConfig } from "@/lib/trigger-client";
import { getGithubContext } from "@/lib/github";
import { sealFixGithubGrant } from "@/lib/fix-github-grant";
import { getSql } from "@/lib/db";
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
  let stage = "PROFILE_AUTH";
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
    stage = "PROFILE_PROJECT";
    await profileProject(owner, projectId);
    if (action === "read") {
      stage = "PROFILE_STATUS";
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
    }
    stage = "PROFILE_INPUT";
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
      stage = "PROFILE_CANCEL";
      await cancelProfileGeneration(owner, projectId, input.id);
      try {
        const { tasks } = await import("@trigger.dev/sdk");
        await tasks.trigger(
          "release-profile-browser",
          { owner, projectId, captureId: input.id },
          getTriggerClientConfig(),
        );
      } catch {
        /* Database cancellation is durable; provider TTL bounds release failures. */
      }
      return NextResponse.json({ generation: null }, { headers });
    }
    stage = "PROFILE_QUEUE_CONFIG";
    let config;
    try {
      config = getTriggerClientConfig();
    } catch (error) {
      throw new ProfileError(
        error instanceof Error
          ? error.message
          : "Check the web app's Trigger.dev configuration.",
      );
    }
    stage = "PROFILE_QUEUE_RUNTIME";
    const { tasks } = await import("@trigger.dev/sdk");
    stage = "PROFILE_RESERVE";
    let id: string;
    if (action === "start") {
      const github = await getGithubContext(req);
      if (!github)
        throw new ProfileError(
          "Reconnect GitHub so PreFlight can inspect this project's authentication code.",
        );
      id = (await startProfileGeneration(owner, projectId, input)).id;
      try {
        await getSql()`UPDATE profile_captures SET automation_github_grant=${sealFixGithubGrant(`profile:${id}`, owner, github)} WHERE id=${id}::uuid AND owner_github_id=${owner} AND project_id=${projectId} AND status='active'`;
      } catch (error) {
        await failGenerationQueue(owner, projectId, id);
        throw error;
      }
    } else {
      await resumeProfileGeneration(owner, projectId, input.id);
      id = input.id;
    }
    try {
      stage = "PROFILE_QUEUE";
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
    stage = "PROFILE_STATUS";
    return NextResponse.json(
      { generation: await getProfileGeneration(owner, projectId, id) },
      { status: 202, headers },
    );
  } catch (error) {
    const databaseCode =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "string" &&
      /^[A-Z0-9]{5}$/.test(error.code)
        ? error.code
        : "";
    if (!(error instanceof ProfileError))
      console.error("Automatic profile setup failed", {
        stage,
        databaseCode,
        errorName: error instanceof Error ? error.name : "unknown",
      });
    const diagnostic = databaseCode ? `${stage}/${databaseCode}` : stage;
    const message =
      databaseCode === "42501"
        ? `PreFlight's database role cannot save profile setup records. Check its table permissions (${diagnostic}).`
        : stage === "PROFILE_QUEUE_RUNTIME"
          ? `The web app could not load the task queue. Redeploy the web app (${diagnostic}).`
          : `Profile setup failed during ${stage === "PROFILE_RESERVE" ? "saving the setup" : stage === "PROFILE_STATUS" ? "reading its status" : stage === "PROFILE_AUTH" ? "checking sign-in" : "preparation"} (${diagnostic}). Retry; if it persists, report this code.`;
    return NextResponse.json(
      {
        error: error instanceof ProfileError ? error.message : message,
        code: diagnostic,
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
