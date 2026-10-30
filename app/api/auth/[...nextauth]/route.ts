import { auth, handlers } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { guestCookieName } from "@/lib/guest-demo";

export const { POST } = handlers;
export async function GET(req: NextRequest) {
  if (req.nextUrl.pathname === "/api/auth/session" && req.cookies.has(guestCookieName()))
    return NextResponse.json((await auth()) || {}, { headers: { "Cache-Control": "private, no-store" } });
  const response = await handlers.GET(req);
  // Completing OAuth switches back to the real account even if the caller
  // entered GitHub directly instead of using the demo's Leave button.
  if (req.nextUrl.pathname === "/api/auth/callback/github" &&
    /(?:^|[,\s])(?:__Secure-)?authjs\.session-token(?:\.\d+)?=[^;,\s]+/.test(response.headers.get("set-cookie") || "")) {
    const expired = new NextResponse();
    expired.cookies.set(guestCookieName(), "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
    const headers = new Headers(response.headers);
    headers.append("set-cookie", expired.headers.get("set-cookie")!);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  return response;
}
