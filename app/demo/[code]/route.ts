import { NextRequest, NextResponse } from "next/server";
import { enterGuestDemo, GuestDemoError, guestCookieName } from "@/lib/guest-demo";
import { readGuestSession, encodeGuestSession } from "@/lib/guest-session";

export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };

export function HEAD() { return new NextResponse(null, { status: 204, headers }); }

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  if (req.headers.has("next-router-prefetch") || /prefetch/i.test(req.headers.get("purpose") || req.headers.get("sec-purpose") || ""))
    return new NextResponse(null, { status: 204, headers });
  try {
    const raw = req.cookies.get(guestCookieName())?.value;
    const previous = raw ? await readGuestSession(raw) : null;
    const guest = await enterGuestDemo((await params).code, previous?.user?.githubId && previous.user.demoProjectId ?
      { actor: previous.user.githubId, projectId: previous.user.demoProjectId } : undefined);
    const token = await encodeGuestSession(guest);
    const response = NextResponse.redirect(new URL(`/dashboard/projects/${guest.project_id}`, req.url), { status: 303, headers });
    response.cookies.set(guestCookieName(), token.value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: token.maxAge });
    return response;
  } catch (error) {
    return new NextResponse(error instanceof GuestDemoError ? error.message : "The demo could not open. Please reload this invitation to try again.",
      { status: error instanceof GuestDemoError ? 404 : 503, headers });
  }
}
