import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { joinProject, ProjectInviteError } from "@/lib/project-collaboration";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  if (req.headers.get("origin") !== req.nextUrl.origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers });
  const user = (await auth())?.user;
  if (!user?.githubId || !user.githubLogin || user.isTestUser) return NextResponse.json({ error: "Sign in with GitHub to join." }, { status: 401, headers });
  try {
    const raw = await req.text();
    if (raw.length > 200) throw new ProjectInviteError("Enter the code from your invitation email.");
    const input = JSON.parse(raw);
    if (!input || typeof input !== "object" || Array.isArray(input) || (input.code !== undefined && typeof input.code !== "string")) throw new ProjectInviteError("Enter a valid confirmation code.");
    return NextResponse.json(await joinProject((await params).token, user.githubId, user.githubLogin, input.code), { headers });
  } catch (error) { return NextResponse.json({ error: error instanceof ProjectInviteError ? error.message : "Could not accept this invitation. Try again." }, { status: 400, headers }); }
}
