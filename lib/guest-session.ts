import { decode, encode } from "next-auth/jwt";
import type { Session } from "next-auth";
import { activeGuest, guestCookieName, GUEST_MAX_AGE } from "@/lib/guest-demo";

export async function readGuestSession(raw: string): Promise<Session | null> {
  try {
    const token = await decode({ token: raw, salt: guestCookieName(), secret: process.env.AUTH_SECRET! });
    if (token?.preflightGuestIdentity !== true || !token.sub || !Number.isSafeInteger(token.projectId)) return null;
    const guest = await activeGuest(token.sub, Number(token.projectId));
    if (!guest) return null;
    return { user: { name: "Guest judge", githubId: guest.actor_id, isGuest: true, demoProjectId: guest.project_id }, expires: new Date(guest.expires_at).toISOString() };
  } catch { return null; }
}

export async function encodeGuestSession(guest: { actor_id: string; project_id: number; expires_at: string }) {
  const maxAge = Math.min(GUEST_MAX_AGE, Math.floor((new Date(guest.expires_at).getTime() - Date.now()) / 1000));
  if (!process.env.AUTH_SECRET || maxAge <= 0) throw new Error("The demo session could not be created.");
  return { maxAge, value: await encode({ secret: process.env.AUTH_SECRET, salt: guestCookieName(), maxAge,
    token: { sub: guest.actor_id, projectId: guest.project_id, name: "Guest judge", preflightGuestIdentity: true } }) };
}
