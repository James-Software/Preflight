import { NextRequest, NextResponse } from "next/server";
import {
  refreshRunTestUser,
  verifyTestUserRequest,
} from "@/lib/test-user-issuer";
export const runtime = "nodejs";
export const maxDuration = 60;
const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

/** Only a signed worker request for a current run can refresh its snapshot. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    if (
      body.length > 2000 ||
      !verifyTestUserRequest(
        body,
        req.headers.get("x-preflight-issuer-signature") || "",
      )
    )
      return NextResponse.json(
        { error: "Unauthorized renewal request." },
        { status: 403, headers },
      );
    const input = JSON.parse(body);
    if (
      !input ||
      input.action !== "renew-run" ||
      !Number.isSafeInteger(input.runId) ||
      input.runId <= 0 ||
      !Number.isFinite(input.timestamp) ||
      Math.abs(Date.now() - input.timestamp) > 60000
    )
      return NextResponse.json(
        { error: "Invalid or expired renewal request." },
        { status: 400, headers },
      );
    await refreshRunTestUser(input.runId);
    return NextResponse.json({ renewed: true }, { headers });
  } catch {
    return NextResponse.json(
      {
        error:
          "This saved test session could not be renewed. Confirm the profile is active and web/worker deployments share their encryption key.",
      },
      { status: 409, headers },
    );
  }
}
