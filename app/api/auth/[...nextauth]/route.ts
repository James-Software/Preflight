import { auth, handlers } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { guestCookieName } from "@/lib/guest-demo";

export const { POST } = handlers;
export async function GET(req: NextRequest) {
  if (req.nextUrl.pathname === "/api/auth/session" && req.cookies.has(guestCookieName()))
    return NextResponse.json((await auth()) || {}, { headers: { "Cache-Control": "private, no-store" } });
  return handlers.GET(req);
}
