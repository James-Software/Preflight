import { NextRequest, NextResponse } from "next/server";
import { investigationSource, validInvestigationRequest } from "@/lib/investigation-source";
export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    if (body.length > 4000 || !validInvestigationRequest(body, req.headers.get("x-preflight-investigation") || ""))
      return NextResponse.json({ error: "Unauthorized source request." }, { status: 403, headers });
    return NextResponse.json(await investigationSource(JSON.parse(body)), { headers });
  } catch {
    return NextResponse.json({ error: "Source inspection is unavailable for this run." }, { status: 409, headers });
  }
}
