import { GithubAuthError, type GithubContext } from "@/lib/github";

export type RunTarget =
  | { type: "branch"; ref: string }
  | { type: "pull-request"; number: number };
export type TargetOption = {
  type: "branch" | "pull-request";
  ref: string;
  number?: number;
  label: string;
  isDefault?: boolean;
};
export class RunTargetError extends Error {}
function github(ctx: GithubContext, repo: string) {
  if (
    !/^[\w.-]+\/[\w.-]+$/.test(repo) ||
    repo.split("/")[0].toLowerCase() !== ctx.login.toLowerCase()
  )
    throw new RunTargetError("You can only test repositories you own.");
  return async (path: string) => {
    const response = await fetch(
      `https://api.github.com/repos/${repo}${path}`,
      {
        headers: {
          Authorization: `Bearer ${ctx.accessToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (response.status === 401) throw new GithubAuthError();
    if (!response.ok)
      throw new RunTargetError(
        response.status === 404
          ? "This repository, branch or PR is no longer available."
          : "Could not load this repository from GitHub. Try again.",
      );
    return response.json();
  };
}
export function parseRunTarget(value: unknown): RunTarget {
  const v = value as Record<string, unknown> | null;
  if (
    v?.type === "branch" &&
    typeof v.ref === "string" &&
    v.ref.length > 0 &&
    v.ref.length <= 250 &&
    !/[\x00-\x20]/.test(v.ref)
  )
    return { type: "branch", ref: v.ref };
  if (
    v?.type === "pull-request" &&
    Number.isSafeInteger(v.number) &&
    Number(v.number) > 0
  )
    return { type: "pull-request", number: Number(v.number) };
  throw new RunTargetError("Choose a branch or an open pull request.");
}
export async function listRunTargets(ctx: GithubContext, repo: string) {
  const api = github(ctx, repo);
  const [metadata, branches, pulls] = await Promise.all([
    api(""),
    api("/branches?per_page=100"),
    api("/pulls?state=open&sort=updated&direction=desc&per_page=100"),
  ]);
  const options: TargetOption[] = [
    {
      type: "branch",
      ref: metadata.default_branch,
      label: metadata.default_branch,
      isDefault: true,
    },
  ];
  for (const b of branches)
    if (b.name !== metadata.default_branch)
      options.push({ type: "branch", ref: b.name, label: b.name });
  for (const pr of pulls)
    options.push({
      type: "pull-request",
      number: pr.number,
      ref: pr.head.ref,
      label: pr.title,
    });
  return {
    options,
    defaultBranch: metadata.default_branch,
    truncated: branches.length === 100 || pulls.length === 100,
  };
}
/** Resolve a successful deployment of the exact selected head; never silently use main. */
export async function resolveRunTarget(
  ctx: GithubContext,
  repo: string,
  target: RunTarget,
  appUrl: string | null,
) {
  const api = github(ctx, repo),
    metadata = await api("");
  let sha: string, ref: string;
  if (target.type === "branch") {
    const branch = await api(`/branches/${encodeURIComponent(target.ref)}`);
    sha = branch.commit.sha;
    ref = branch.name;
    if (ref === metadata.default_branch && appUrl)
      return { url: appUrl, ref, sha };
  } else {
    const pr = await api(`/pulls/${target.number}`);
    if (pr.state !== "open")
      throw new RunTargetError(
        "This pull request is no longer open. Choose another target.",
      );
    sha = pr.head.sha;
    ref = `PR #${pr.number} · ${pr.head.ref}`;
  }
  const deployments = await api(
    `/deployments?sha=${encodeURIComponent(sha)}&per_page=30`,
  );
  for (const deployment of deployments) {
    if (deployment.sha !== sha) continue;
    const statuses = await api(
      `/deployments/${deployment.id}/statuses?per_page=1`,
    );
    const latest = statuses[0];
    if (latest?.state !== "success") continue;
    const raw = latest.environment_url || deployment.environment_url;
    try {
      const url = new URL(raw);
      if (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password
      )
        return { url: url.href, ref, sha };
    } catch {
      /* Invalid deployment URLs are not runnable. */
    }
  }
  throw new RunTargetError(
    `No successful deployment found for the current commit of ${ref}. Deploy that branch or PR with your hosting provider, then try again.`,
  );
}
