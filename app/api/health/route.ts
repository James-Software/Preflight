import { getSql } from "@/lib/db";
import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const maxDuration = 10;
export async function GET() {
  const headers = { "Cache-Control": "private, no-store, max-age=0" };
  try {
    await getSql().query("SELECT 1 AS alive", [], { fetchOptions: { signal: AbortSignal.timeout(5000) } });
    return NextResponse.json({ status: "ok" }, { headers });
  } catch {
    // Availability only: never disclose configuration, errors or credentials.
    return NextResponse.json({ status: "degraded" }, { status: 503, headers });
  }
}
