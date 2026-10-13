import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

/* ------------------------------------------------------------------ */
/* Server-side GitHub API helpers. The user's access token lives only  */
/* in the encrypted JWT (never on the session), so it never reaches    */
/* the browser. Every repo surfaced here is hard-gated on ownership:  */
/* the repo's owner login must match the signed-in user's login.       */
/* ------------------------------------------------------------------ */

export class GithubAuthError extends Error {}

export type GithubContext = {
  accessToken: string;
  login: string;
};

export async function getGithubContext(
  req: NextRequest
): Promise<GithubContext | null> {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });
  const t = token as unknown as Record<string, unknown> | null;
  const accessToken = t?.githubAccessToken;
  const login = t?.githubLogin;
  if (
    typeof accessToken !== "string" ||
    !accessToken ||
    typeof login !== "string" ||
    !login
  ) {
    return null;
  }
  return { accessToken, login };
}

const API_BASE = "https://api.github.com";
const API_VERSION = "2022-11-28";

function apiHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": API_VERSION,
  };
}

export type SlimRepo = {
  fullName: string;
  private: boolean;
  defaultBranch: string;
  pushedAt: string | null;
};

type GhRepoJson = {
  full_name: string;
  owner?: { login?: string };
  private: boolean;
  default_branch: string;
  pushed_at: string | null;
  permissions?: { admin?: boolean; push?: boolean; pull?: boolean };
};

function parseNextLink(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    const m = part.match(/<([^>]+)>;\s*rel="next"/);
    if (m) return m[1];
  }
  return null;
}

const ownsRepo = (ctx: GithubContext, ownerLogin: string | undefined) =>
  (ownerLogin ?? "").toLowerCase() === ctx.login.toLowerCase();

/** Repos owned by the caller, most recently pushed first (max ~300). */
export async function listOwnedRepos(
  ctx: GithubContext
): Promise<SlimRepo[]> {
  const out: SlimRepo[] = [];
  let url: string | null = `${API_BASE}/user/repos?type=owner&sort=pushed&direction=desc&per_page=100`;
  let pages = 0;
  while (url && pages < 3) {
    pages += 1;
    const res = await fetch(url, { headers: apiHeaders(ctx.accessToken) });
    if (res.status === 401) throw new GithubAuthError();
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    const data = (await res.json()) as GhRepoJson[];
    for (const r of data) {
      // Hard ownership gate: never surface a repo the caller doesn't own,
      // even if the upstream filter ever misbehaves.
      if (!ownsRepo(ctx, r.owner?.login)) continue;
      out.push({
        fullName: r.full_name,
        private: r.private,
        defaultBranch: r.default_branch,
        pushedAt: r.pushed_at,
      });
    }
    url = parseNextLink(res.headers.get("link"));
  }
  return out;
}

export type VerifyResult =
  | {
      ok: true;
      fullName: string;
      private: boolean;
      defaultBranch: string;
      appInstalled: boolean | null;
    }
  | { ok: false; error: string };

/**
 * Verify a repo for project creation. Ownership is the security boundary:
 * the owner segment must be the caller's login. Also reports whether the
 * PreFlight GitHub App is installed (needed later for fix PRs); null when
 * GitHub won't say.
 */
export async function verifyRepo(
  ctx: GithubContext,
  owner: string,
  repo: string
): Promise<VerifyResult> {
  if (!ownsRepo(ctx, owner)) {
    return { ok: false, error: "You can only connect repositories you own." };
  }
  const res = await fetch(`${API_BASE}/repos/${owner}/${repo}`, {
    headers: apiHeaders(ctx.accessToken),
  });
  if (res.status === 401) throw new GithubAuthError();
  if (res.status === 404) {
    return {
      ok: false,
      error: "Repository not found or not visible to your GitHub account.",
    };
  }
  if (!res.ok) {
    return { ok: false, error: `GitHub API error (${res.status}). Try again.` };
  }
  const data = (await res.json()) as GhRepoJson;
  if (!ownsRepo(ctx, data.owner?.login)) {
    return { ok: false, error: "You can only connect repositories you own." };
  }
  if (!data.permissions?.push && !data.permissions?.admin) {
    return {
      ok: false,
      error: "Your GitHub account cannot push to this repository.",
    };
  }
  let appInstalled: boolean | null = null;
  try {
    const inst = await fetch(
      `${API_BASE}/repos/${owner}/${repo}/installation`,
      { headers: apiHeaders(ctx.accessToken) }
    );
    if (inst.status === 200) appInstalled = true;
    else if (inst.status === 404) appInstalled = false;
  } catch {
    appInstalled = null;
  }
  return {
    ok: true,
    fullName: data.full_name,
    private: data.private,
    defaultBranch: data.default_branch,
    appInstalled,
  };
}
