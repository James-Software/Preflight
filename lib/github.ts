import {
  loadGithubCredentials,
  GithubReconnectRequired,
} from "@/lib/github-credentials";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { assertProjectRepositoryAccess, ProjectRepositoryError, type ProjectRepositoryGrant } from "@/lib/project-repository-access";

/* ------------------------------------------------------------------ */
/* Server-side GitHub API helpers. Rotating credentials live encrypted */
/* in the database; legacy encrypted JWT tokens remain compatible.     */
/* Every repo surfaced here is hard-gated on ownership:                */
/* the repo's owner login must match the signed-in user's login.       */
/* ------------------------------------------------------------------ */

export class GithubAuthError extends Error {}

export type GithubContext = {
  accessToken: string;
  login: string;
  ownerGithubId?: string;
  projectGrant?: ProjectRepositoryGrant;
};

export async function getGithubContext(
  req: NextRequest,
): Promise<GithubContext | null> {
  // Production uses the __Secure- cookie prefix; getToken must be told.
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    secureCookie: process.env.NODE_ENV === "production",
  });
  const t = token as unknown as Record<string, unknown> | null;
  if (t?.preflightTestIdentity === true) return null;
  if (typeof t?.sub === "string") {
    try {
      const saved = await loadGithubCredentials(t.sub);
      if (saved) return { ...saved, ownerGithubId: t.sub };
      if (t.githubConnection) return null;
    } catch (error) {
      if (error instanceof GithubReconnectRequired) return null;
      throw error;
    }
  }
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
  return {
    accessToken,
    login,
    ...(typeof t?.sub === "string" ? { ownerGithubId: t.sub } : {}),
  };
}

const API_BASE = "https://api.github.com";
const API_VERSION = "2022-11-28";

/** GitHub App slug for "Preflight QA" — install links and detection. */
export const GITHUB_APP_SLUG = "preflight-qa";

/**
 * True when the user has installed the PreFlight GitHub App on their
 * account. Without an installation the login token can only see public
 * repositories, so private repos never appear in the picker. Fails
 * closed to false.
 */
export async function isAppInstalledForUser(
  ctx: GithubContext,
): Promise<boolean> {
  try {
    const res = await fetchGithub(
      ctx,
      `${API_BASE}/user/installations?per_page=100`,
      {
        headers: apiHeaders(ctx.accessToken),
      },
    );
    if (!res.ok) return false;
    const data = (await res.json()) as {
      installations?: { app_slug?: string }[];
    };
    return (data.installations ?? []).some(
      (i) => i.app_slug === GITHUB_APP_SLUG,
    );
  } catch {
    return false;
  }
}

function apiHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": API_VERSION,
  };
}

/** Retry a 401 once if another request just rotated this connection's token. */
export async function fetchGithub(
  ctx: GithubContext,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  if (ctx.projectGrant?.actor.startsWith("guest:") && !["GET", "HEAD"].includes((init.method || "GET").toUpperCase()))
    throw new ProjectRepositoryError("Guest demos cannot change the example repository.");
  if (new URL(url).origin !== API_BASE)
    throw new Error("Invalid GitHub API URL.");
  if (ctx.projectGrant) await assertProjectRepositoryAccess(ctx.projectGrant, new URL(url));
  const request = (token: string) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("Accept"))
      headers.set("Accept", "application/vnd.github+json");
    if (!headers.has("X-GitHub-Api-Version"))
      headers.set("X-GitHub-Api-Version", API_VERSION);
    return fetch(url, {
      ...init,
      ...(ctx.projectGrant ? { redirect: "error" } : {}),
      headers,
      cache: init.cache ?? "no-store",
      signal: init.signal ?? AbortSignal.timeout(15_000),
    });
  };
  let response = await request(ctx.accessToken);
  if (response.status === 401 && ctx.ownerGithubId) {
    let current;
    try {
      current = await loadGithubCredentials(ctx.ownerGithubId);
    } catch (error) {
      if (!(error instanceof GithubReconnectRequired)) throw error;
    }
    if (current && current.accessToken !== ctx.accessToken) {
      await response.body?.cancel();
      ctx.accessToken = current.accessToken;
      response = await request(current.accessToken);
    }
  }
  if (ctx.projectGrant && response.status === 401)
    throw new ProjectRepositoryError("The project owner needs to reconnect GitHub for this repository.");
  return response;
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
  homepage?: string | null;
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
export async function listOwnedRepos(ctx: GithubContext): Promise<SlimRepo[]> {
  const out: SlimRepo[] = [];
  let url: string | null =
    `${API_BASE}/user/repos?type=owner&sort=pushed&direction=desc&per_page=100`;
  let pages = 0;
  while (url && pages < 3) {
    pages += 1;
    const res = await fetchGithub(ctx, url, {
      headers: apiHeaders(ctx.accessToken),
    });
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
      homepage: string | null;
      appInstalled: boolean | null;
    }
  | { ok: false; error: string };

/**
 * Latest successful preview deployment for a repo's default branch.
 * Used when a project has no App URL: the run tests the branch's current
 * preview instead of a fixed URL. Returns null when nothing suitable exists.
 * Throws GithubAuthError when the caller's token is expired.
 */
export async function resolveDefaultBranchPreview(
  ctx: GithubContext,
  owner: string,
  repo: string,
): Promise<{ url: string; branch: string } | null> {
  const repoRes = await fetchGithub(ctx, `${API_BASE}/repos/${owner}/${repo}`, {
    headers: apiHeaders(ctx.accessToken),
  });
  if (repoRes.status === 401) throw new GithubAuthError();
  if (!repoRes.ok) return null;
  const repoData = (await repoRes.json()) as { default_branch?: string };
  const branch = repoData.default_branch || "main";

  const depRes = await fetchGithub(
    ctx,
    `${API_BASE}/repos/${owner}/${repo}/deployments?ref=${encodeURIComponent(
      branch,
    )}&per_page=10`,
    { headers: apiHeaders(ctx.accessToken) },
  );
  if (depRes.status === 401) throw new GithubAuthError();
  if (!depRes.ok) return null;
  const deployments = (await depRes.json()) as {
    id: number;
    environment_url?: string | null;
  }[];

  // Latest deployment whose newest status is a success, with a URL.
  for (const d of deployments.slice(0, 5)) {
    if (!d.environment_url) continue;
    try {
      const stRes = await fetchGithub(
        ctx,
        `${API_BASE}/repos/${owner}/${repo}/deployments/${d.id}/statuses?per_page=1`,
        { headers: apiHeaders(ctx.accessToken) },
      );
      if (stRes.status === 401) throw new GithubAuthError();
      if (!stRes.ok) continue;
      const statuses = (await stRes.json()) as { state?: string }[];
      if (statuses[0]?.state === "success") {
        return { url: d.environment_url, branch };
      }
    } catch (e) {
      if (e instanceof GithubAuthError) throw e;
    }
  }
  return null;
}

/**
 * Verify a repo for project creation. Ownership is the security boundary:
 * the owner segment must be the caller's login. Also reports whether the
 * PreFlight GitHub App is installed (needed later for fix PRs); null when
 * GitHub won't say.
 */
export async function verifyRepo(
  ctx: GithubContext,
  owner: string,
  repo: string,
): Promise<VerifyResult> {
  if (!ownsRepo(ctx, owner)) {
    return { ok: false, error: "You can only connect repositories you own." };
  }
  const res = await fetchGithub(ctx, `${API_BASE}/repos/${owner}/${repo}`, {
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
    const inst = await fetchGithub(
      ctx,
      `${API_BASE}/repos/${owner}/${repo}/installation`,
      { headers: apiHeaders(ctx.accessToken) },
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
    homepage: data.homepage?.trim() || null,
    appInstalled,
  };
}
