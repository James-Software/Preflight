import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getInviteStatus,
  getOrCreateInviteCode,
  MAX_INVITES,
} from "@/lib/invites";

function inviteLink(code: string): string {
  const base = (process.env.AUTH_URL ?? "").replace(/\/+$/, "");
  return `${base}/invite/${code}`;
}

/** GET /api/invites — the caller's invite status. */
export async function GET() {
  const session = await auth();
  const login = session?.user?.githubLogin;
  if (!login) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const status = await getInviteStatus(login);
  return NextResponse.json({
    canInvite: status.canInvite,
    remaining: status.remaining,
    max: MAX_INVITES,
    code: status.code,
    link: status.code ? inviteLink(status.code) : null,
  });
}

/** POST /api/invites — creates (or returns) the caller's invite link. */
export async function POST() {
  const session = await auth();
  const login = session?.user?.githubLogin;
  if (!login) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const code = await getOrCreateInviteCode(login);
  if (!code) {
    return NextResponse.json(
      { error: "Invites are only available to waitlist-approved members." },
      { status: 403 }
    );
  }
  const status = await getInviteStatus(login);
  return NextResponse.json({
    canInvite: true,
    remaining: status.remaining,
    max: MAX_INVITES,
    code,
    link: inviteLink(code),
  });
}
