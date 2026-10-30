import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSql } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { authenticateRunAgent } from "@/lib/run-agent-access";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'", "X-Frame-Options": "DENY" };

export async function GET(req: NextRequest, context: { params: Promise<{ runId: string; screenshotId: string }> }) {
  const { runId: rawId, screenshotId } = await context.params;
  const runId = Number(rawId);
  if (!Number.isSafeInteger(runId) || runId <= 0 || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(screenshotId))
    return NextResponse.json({ error: "Screenshot unavailable." }, { status: 404, headers });
  let actor: string | undefined;
  if (req.headers.has("authorization")) {
    try {
      const grant = await authenticateRunAgent(req.headers.get("authorization"));
      if (grant.run_id !== runId) throw new Error();
      actor = grant.actor_id;
    } catch { return NextResponse.json({ error: "Screenshot unavailable." }, { status: 401, headers }); }
  } else actor = (await auth())?.user?.githubId;
  if (!actor) return NextResponse.json({ error: "Sign in to view evidence." }, { status: 401, headers });
  await ensureSchema();
  const rows = await getSql()`SELECT encode(s.content,'base64') AS content FROM run_screenshots s
    JOIN runs r ON r.id=s.run_id JOIN projects p ON p.id=r.project_id
    WHERE s.id=${screenshotId}::uuid AND s.run_id=${runId} AND
      (p.owner_github_id=${actor} OR EXISTS(SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=${actor}))`;
  const screenshot = (rows as any[])[0];
  if (!screenshot) return NextResponse.json({ error: "Screenshot unavailable." }, { status: 404, headers });
  return new NextResponse(new Uint8Array(Buffer.from(screenshot.content, "base64")), { headers: { ...headers, "Content-Type": "image/jpeg" } });
}
