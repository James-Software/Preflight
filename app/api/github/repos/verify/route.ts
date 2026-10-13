import { NextRequest, NextResponse } from "next/server";
import {
  getGithubContext,
  verifyRepo,
  GithubAuthError,
} from "@/lib/github";

/**
 * GET /api/github/repos/verify?repo=owner/name — verifies a repo for project
 * creation: it exists, the caller owns it, and reports whether the PreFlight
 * GitHub App is installed on it (needed later for fix PRs).
 */
export async function GET(req: NextRequest) {
  const ctx = await getGithubContext(req);
  if (!ctx) {
    return NextResponse.json(
      { error: "GitHub session expired. Please log in again.", tokenMissing: true },
      { status: 401 }
    );
  }
  const fullName = (req.nextUrl.searchParams.get("repo") ?? "").trim();
  const m = fullName.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (!m) {
    return NextResponse.json({
      ok: false,
      error: "Enter the repo as owner/name or paste a github.com link.",
    });
  }
  try {
    const result = await verifyRepo(ctx, m[1], m[2]);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof GithubAuthError) {
      return NextResponse.json(
        { error: "GitHub session expired. Please log in again.", tokenExpired: true },
        { status: 401 }
      );
    }
    return NextResponse.json({
      ok: false,
      error: "Could not verify the repository. Try again.",
    });
  }
}
