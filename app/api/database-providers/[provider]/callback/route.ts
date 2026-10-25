import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getProject } from "@/lib/schema";
import {
  databaseProvider,
  exchangeProviderTokens,
} from "@/lib/database-provider-api";
import {
  unsealProvider,
  saveProviderAccount,
} from "@/lib/database-provider-accounts";
export const maxDuration = 60;
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  let provider: "neon" | "supabase";
  try {
    provider = databaseProvider((await params).provider);
  } catch {
    return new NextResponse("Unknown provider", { status: 404 });
  }
  const cookie = `database-oauth-${provider}`;
  let projectId: number | null = null,
    connected = false;
  try {
    const owner = (await auth())?.user?.githubId;
    if (!owner) throw new Error("No session");
    const flow = unsealProvider<{
      state: string;
      verifier: string;
      projectId: number;
      redirectUri: string;
      expiresAt: number;
    }>(req.cookies.get(cookie)?.value || "", owner, provider, "oauth");
    if (
      !Number.isSafeInteger(flow.projectId) ||
      flow.projectId <= 0 ||
      flow.expiresAt < Date.now() ||
      !(await getProject(flow.projectId, owner))
    )
      throw new Error("Invalid grant");
    projectId = flow.projectId;
    const state = Buffer.from(req.nextUrl.searchParams.get("state") || ""),
      expected = Buffer.from(flow.state);
    const code = req.nextUrl.searchParams.get("code");
    if (
      state.length !== expected.length ||
      !timingSafeEqual(state, expected) ||
      req.nextUrl.searchParams.has("error") ||
      !code ||
      code.length > 4096
    )
      throw new Error("Invalid authorization");
    const tokens = await exchangeProviderTokens(provider, {
      grant_type: "authorization_code",
      code,
      redirect_uri: flow.redirectUri,
      code_verifier: flow.verifier,
    });
    await saveProviderAccount(owner, provider, tokens);
    connected = true;
  } catch {
    /* No provider errors, tokens or authorization codes go into redirects/logs. */
  }
  const target = new URL(
    projectId ? `/dashboard/projects/${projectId}` : "/dashboard",
    req.url,
  );
  target.searchParams.set(
    connected ? "databaseProvider" : "databaseProviderError",
    provider,
  );
  target.hash = "database-settings";
  const response = NextResponse.redirect(target);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.set(cookie, "", {
    maxAge: 0,
    path: `/api/database-providers/${provider}`,
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
  });
  return response;
}
