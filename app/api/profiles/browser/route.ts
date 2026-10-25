import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { ProfileError } from "@/lib/auth-profile-state";
import {
  startProfileCapture,
  finishProfileCapture,
  activeProfileCapture,
} from "@/lib/profile-capture";
export const runtime = "nodejs";
export const maxDuration = 60;
async function handle(req: NextRequest, action: "start" | "save" | "cancel") {
  if (req.headers.get("origin") !== req.nextUrl.origin)
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const owner = (await auth())?.user?.githubId;
  if (!owner)
    return NextResponse.json(
      { error: "Sign in again to create a profile." },
      { status: 401 },
    );
  try {
    const raw = await req.text();
    if (raw.length > 5000)
      throw new ProfileError("Profile settings are too large.");
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      throw new ProfileError("Enter valid profile settings.");
    }
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new ProfileError("Complete the profile settings.");
    if (action === "start")
      return NextResponse.json(await startProfileCapture(owner, input), {
        headers: { "Cache-Control": "no-store" },
      });
    if (typeof input.id !== "string")
      throw new ProfileError("Choose a sign-in session.");
    const profile = await finishProfileCapture(
      owner,
      input.id,
      action === "cancel",
    );
    revalidatePath("/dashboard/profiles");
    return NextResponse.json(
      { profile },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof ProfileError
            ? error.message
            : "Could not complete browser sign-in. Please try again.",
      },
      { status: 400 },
    );
  }
}
export async function POST(req: NextRequest) {
  return handle(req, "start");
}
export async function PATCH(req: NextRequest) {
  return handle(req, "save");
}
export async function DELETE(req: NextRequest) {
  return handle(req, "cancel");
}

export async function GET() {
  const owner = (await auth())?.user?.githubId;
  if (!owner)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(
      { capture: await activeProfileCapture(owner) },
      {
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Could not restore sign-in browser." },
      { status: 400 },
    );
  }
}
