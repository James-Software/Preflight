import { NextRequest, NextResponse } from "next/server";
import { guestCookieName } from "@/lib/guest-demo";
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin) return new NextResponse("Invalid request origin.", { status: 403 });
  const next = req.nextUrl.searchParams.get("next") === "login" ? "/login" : "/";
  const response = NextResponse.redirect(new URL(next, req.url), 303);
  response.headers.set("Cache-Control", "private, no-store");
  response.cookies.set(guestCookieName(), "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
