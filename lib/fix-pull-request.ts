import type { GithubContext } from "@/lib/github";
import { mergePatches, parsePatch, type PatchFile } from "@/lib/fix-patches";

type Fix = { id: number; title: string; patch_diff: string | null };
type PullRequest = { html_url: string; number: number };

export class FixPatchError extends Error {}

/** Commit one selected group on a new branch; never change the default branch. */
export async function openFixPullRequest(
  ctx: GithubContext,
  repo: string,
  branch: string,
  fixes: Fix[],
  reportUrl: string,
): Promise<PullRequest> {
  const [owner, name] = repo.split("/");
  if (
    !owner ||
    !name ||
    owner.toLowerCase() !== ctx.login.toLowerCase() ||
    !/^[\w.-]+\/[\w.-]+$/.test(repo)
  )
    throw new Error("You can only open fix PRs for repositories you own.");
  const base = `https://api.github.com/repos/${repo}`;
  const request = async (
    path: string,
    method = "GET",
    body?: unknown,
    allow404 = false,
  ): Promise<any> => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (allow404 && response.status === 404) return null;
    if (!response.ok) {
      if (response.status === 401)
        throw new Error(
          "Your GitHub session expired. Sign in again, then retry this group.",
        );
      if (response.status === 403 || response.status === 404)
        throw new Error(
          "Allow the PreFlight GitHub App access to this repository with Contents and Pull requests write permissions, then sign in again.",
        );
      throw new Error(
        `GitHub could not complete this PR (${response.status}). Retry this group; its branch will be reused.`,
      );
    }
    return response.json();
  };
  const findExisting = async (): Promise<PullRequest | undefined> => {
    const prs = await request(
      `/pulls?state=all&head=${encodeURIComponent(`${owner}:${branch}`)}`,
    );
    return prs[0];
  };
  const existing = await findExisting();
  if (existing) return existing;
  const repository = await request("");
  const baseBranch = repository.default_branch;
  let ref = await request(
    `/git/ref/heads/${encodeURIComponent(branch)}`,
    "GET",
    undefined,
    true,
  );
  if (!ref) {
    const baseRef = await request(
      `/git/ref/heads/${encodeURIComponent(baseBranch)}`,
    );
    const commit = await request(`/git/commits/${baseRef.object.sha}`);
    const changed = new Map<
      string,
      {
        content: string | null;
        original: string | null;
        patches: PatchFile[];
        mode: string;
      }
    >();
    for (const fix of fixes) {
      if (!fix.patch_diff)
        throw new Error(`Finding #${fix.id} does not have a proposed fix.`);
      let files;
      try {
        files = parsePatch(fix.patch_diff);
      } catch (error) {
        throw new FixPatchError((error as Error).message);
      }
      for (const file of files) {
        let current = changed.get(file.path);
        if (!current) {
          const data = await request(
            `/contents/${file.path.split("/").map(encodeURIComponent).join("/")}?ref=${baseRef.object.sha}`,
            "GET",
            undefined,
            true,
          );
          if (
            data &&
            (Array.isArray(data) ||
              data.type !== "file" ||
              data.encoding !== "base64" ||
              data.size > 1_000_000)
          )
            throw new FixPatchError(
              `The file ${file.path} needs manual review.`,
            );
          const content = data
            ? Buffer.from(data.content, "base64").toString("utf8")
            : null;
          if (content?.includes("\u0000") || content?.includes("\ufffd"))
            throw new FixPatchError(
              `The file ${file.path} is not supported text.`,
            );
          // Walk the original tree to preserve executable files without a recursive/truncated tree response.
          let treeSha = commit.tree.sha;
          let mode = "100644";
          const segments = file.path.split("/");
          for (let i = 0; i < segments.length; i++) {
            const tree = await request(`/git/trees/${treeSha}`);
            if (tree.truncated)
              throw new FixPatchError(
                "This repository tree needs manual review.",
              );
            const entry = tree.tree.find(
              (node: { path: string }) => node.path === segments[i],
            );
            if (!entry) break;
            if (i === segments.length - 1) {
              if (
                entry.type !== "blob" ||
                !["100644", "100755"].includes(entry.mode)
              )
                throw new FixPatchError(
                  `The file ${file.path} needs manual review.`,
                );
              mode = entry.mode;
            } else {
              if (entry.type !== "tree")
                throw new FixPatchError(
                  `The path ${file.path} needs manual review.`,
                );
              treeSha = entry.sha;
            }
          }
          current = { content, mode, original: content, patches: [] };
        }
        try {
          changed.set(file.path, {
            ...current,
            patches: [...current.patches, file],
            content: mergePatches(current.original, [...current.patches, file]),
          });
        } catch (error) {
          throw new FixPatchError((error as Error).message);
        }
      }
    }
    const tree = await request("/git/trees", "POST", {
      base_tree: commit.tree.sha,
      tree: [...changed].map(([path, file]) =>
        file.content === null
          ? { path, mode: file.mode, type: "blob", sha: null }
          : { path, mode: file.mode, type: "blob", content: file.content },
      ),
    });
    if (tree.sha === commit.tree.sha)
      throw new FixPatchError(
        "These fixes do not change the current default branch.",
      );
    const created = await request("/git/commits", "POST", {
      message: `Fix ${fixes.length === 1 ? fixes[0].title : `${fixes.length} PreFlight findings`}`,
      tree: tree.sha,
      parents: [baseRef.object.sha],
    });
    try {
      ref = await request("/git/refs", "POST", {
        ref: `refs/heads/${branch}`,
        sha: created.sha,
      });
    } catch (error) {
      // Concurrent retries converge on the same branch and PR.
      ref = await request(
        `/git/ref/heads/${encodeURIComponent(branch)}`,
        "GET",
        undefined,
        true,
      );
      if (!ref) throw error;
    }
  }
  try {
    return await request("/pulls", "POST", {
      title:
        fixes.length === 1
          ? fixes[0].title
          : `Fix ${fixes.length} findings from PreFlight`,
      head: branch,
      base: baseBranch,
      body: `Proposed fixes from a PreFlight run. Review and test these changes before merging.\n\n${fixes.map((f) => `- #${f.id}: ${f.title.replace(/[\r\n]/g, " ")}`).join("\n")}\n\n[View run report](${reportUrl})`,
    });
  } catch (error) {
    const retry = await findExisting();
    if (retry) return retry;
    throw error;
  }
}
