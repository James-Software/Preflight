import { NextRequest, NextResponse } from "next/server";
import { getGithubContext, isAppInstalledForUser } from "@/lib/github";

/**
 * GET /api/github/installation — whether the PreFlight GitHub App is
 * installed on the signed-in user's account. Without an installation the
 * login token can only see public repositories.
 */
export async function GET(req: NextRequest) {
  let ctx;
  try {
    ctx = await getGithubContext(req);
  } catch {
    return NextResponse.json(
      {
        error:
          "GitHub connection renewal is temporarily unavailable. Try again shortly.",
      },
      { status: 503 },
    );
  }
  if (!ctx) {
    return NextResponse.json(
      {
        error: "GitHub session expired. Please log in again.",
        tokenMissing: true,
      },
      { status: 401 },
    );
  }
  const installed = await isAppInstalledForUser(ctx);
  return NextResponse.json({ installed });
}
