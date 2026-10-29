import { NextRequest, NextResponse } from "next/server";
import { investigationSource, validInvestigationRequest } from "@/lib/investigation-source";
import { getSql } from "@/lib/db";
import { executeRegression } from "@/lib/investigation-regression";
export const runtime = "nodejs";
export const maxDuration = 180;
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    if (body.length > 30000 || !validInvestigationRequest(body, req.headers.get("x-preflight-investigation") || ""))
      return NextResponse.json({ error: "Unauthorized regression request." }, { status: 403, headers });
    const input = JSON.parse(body);
    if (typeof input.test !== "string" || input.test.length > 24000 || !input.paths?.length)
      return NextResponse.json({ error: "Invalid regression request." }, { status: 400, headers });
    // Re-read source through the live run/owner/lease grant. Never execute
    // worker-supplied source or send GitHub/database/session credentials to a VM.
    const snapshot = await investigationSource(input);
    if (!snapshot.files || snapshot.sha !== input.sha) throw new Error("Source changed.");
    const claimed = await getSql()`UPDATE run_check_investigations SET sandbox_executions=sandbox_executions+1
      WHERE run_id=${input.runId} AND agent_index=${input.agentIndex} AND step_id=${input.stepId}
        AND worker_token=${input.token}::uuid AND state='investigating' AND lease_until>NOW() AND sandbox_executions<2
      RETURNING run_id`;
    if (!(claimed as any[]).length) throw new Error("Regression budget exhausted.");
    const result = await executeRegression(snapshot.files, input.test);
    await investigationSource({ ...input, timestamp: Date.now() });
    return NextResponse.json({ ...result, sha: snapshot.sha }, { headers });
  } catch {
    return NextResponse.json({ error: "Regression execution unavailable; check sandbox authorization and the live source grant." }, { status: 409, headers });
  }
}
