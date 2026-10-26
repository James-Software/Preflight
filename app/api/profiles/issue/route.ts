import { NextRequest, NextResponse } from "next/server";
import {
  issueTestUser,
  verifyTestUserRequest,
  type IssuerRequest,
} from "@/lib/test-user-issuer";
export const runtime = "nodejs";
const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};
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
        { error: "Unauthorized issuer request." },
        { status: 403, headers },
      );
    let input: IssuerRequest;
    try {
      input = JSON.parse(body);
    } catch {
      return NextResponse.json(
        { error: "Invalid issuer request." },
        { status: 400, headers },
      );
    }
    if (!input || typeof input !== "object")
      return NextResponse.json(
        { error: "Invalid issuer request." },
        { status: 400, headers },
      );
    return NextResponse.json(
      { state: await issueTestUser(input) },
      { headers },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "The test-user grant is unavailable or the issuer is not configured.",
      },
      { status: 403, headers },
    );
  }
}
