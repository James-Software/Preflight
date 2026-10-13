import { NextRequest, NextResponse } from "next/server";
import {
  getGithubContext,
  listOwnedRepos,
  GithubAuthError,
} from "@/lib/github";

/**
 * GET /api/github/repos — repositories owned by the signed-in GitHub user,
 * most recently pushed first. The access token never leaves the server.
 */
export async function GET(req: NextRequest) {
  const ctx = await getGithubContext(req);
  if (!ctx) {
    return NextResponse.json(
      { error: "GitHub session expired. Please log in again.", tokenMissing: true },
      { status: 401 }
    );
  }
  try {
    const repos = await listOwnedRepos(ctx);
    return NextResponse.json({ repos });
  } catch (e) {
    if (e instanceof GithubAuthError) {
      return NextResponse.json(
        { error: "GitHub session expired. Please log in again.", tokenExpired: true },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: "Could not load repositories. Try again." },
      { status: 502 }
    );
  }
}
