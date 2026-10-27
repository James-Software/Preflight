import { getSql } from "@/lib/db";
import { loadGithubCredentials } from "@/lib/github-credentials";
import { fetchGithub } from "@/lib/github";
import { investigationSourcePath } from "@/lib/check-investigation";
import { createHmac, timingSafeEqual } from "node:crypto";
import { profileKey } from "@/lib/auth-profile-state";

export function signInvestigationRequest(body: string) {
  return createHmac("sha256", profileKey()).update(`preflight:investigation-source:v1\n${body}`).digest("hex");
}
export function validInvestigationRequest(body: string, signature: string) {
  return /^[a-f0-9]{64}$/.test(signature) && timingSafeEqual(
    Buffer.from(signature, "hex"), Buffer.from(signInvestigationRequest(body), "hex"),
  );
}

/** Web-only broker. Credentials stay here; workers get bounded source, never tokens. */
export async function investigationSource(input: any) {
  if (!input || !Number.isSafeInteger(input.runId) || input.runId <= 0 ||
    !Number.isSafeInteger(input.agentIndex) || typeof input.stepId !== "string" || input.stepId.length > 250 ||
    !/^[a-f0-9-]{36}$/i.test(input.token) || !Number.isFinite(input.timestamp) ||
    Math.abs(Date.now() - input.timestamp) > 60_000 ||
    (input.paths !== undefined && (!Array.isArray(input.paths) || !input.paths.length || input.paths.length > 6 ||
      input.paths.some((p: unknown) => typeof p !== "string" || !investigationSourcePath(p)))))
    throw new Error("Invalid investigation source request.");
  const rows = await getSql()`SELECT r.repo_full_name,r.target_sha,r.target_url,p.owner_github_id
    FROM run_check_investigations i JOIN runs r ON r.id=i.run_id JOIN projects p ON p.id=r.project_id
    WHERE i.run_id=${input.runId} AND i.agent_index=${input.agentIndex} AND i.step_id=${input.stepId}
      AND i.worker_token=${input.token}::uuid AND i.state='investigating' AND i.lease_until>NOW()
      AND r.status='running' AND r.repo_full_name=p.repo_full_name`;
  const run = (rows as any[])[0];
  if (!run || !/^[a-f0-9]{40}$/i.test(run.target_sha || "") ||
    !/^[\w.-]+\/[\w.-]+$/.test(run.repo_full_name || "") || String(run.owner_github_id).startsWith("test:"))
    throw new Error("The run's pinned source is unavailable.");
  const saved = await loadGithubCredentials(run.owner_github_id);
  if (!saved || run.repo_full_name.split("/")[0].toLowerCase() !== saved.login.toLowerCase())
    throw new Error("This repository is no longer authorized.");
  const ctx = { ...saved, ownerGithubId: run.owner_github_id };
  const get = async (path: string) => {
    const res = await fetchGithub(ctx, `https://api.github.com/repos/${run.repo_full_name}${path}`, {
      redirect: "error", signal: AbortSignal.timeout(input.paths ? 12000 : 4000), cache: "no-store",
    });
    if (!res.ok) throw new Error("The pinned source could not be read.");
    return res.json();
  };
  const sha = run.target_sha;
  const tree = await get(`/git/trees/${sha}?recursive=1`);
  if (tree.truncated || !Array.isArray(tree.tree)) throw new Error("The source tree exceeds the inspection limit.");
  const paths: string[] = tree.tree.filter((n: any) => n.type === "blob" &&
    ["100644", "100755"].includes(n.mode) && Number.isFinite(n.size) && n.size <= 40000 && investigationSourcePath(n.path))
    .map((n: any) => n.path);
  if (!paths.length || paths.length > 2500) throw new Error("The source tree exceeds the inspection limit.");
  if (input.paths) {
    if (input.paths.some((p: string) => !paths.includes(p))) throw new Error("Requested source is not eligible.");
    const files: Record<string, string> = {};
    let bytes = 0;
    const contents = await Promise.all([...new Set<string>(input.paths)].map(async (path) => {
      const file = await get(`/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${sha}`);
      if (file.type !== "file" || file.encoding !== "base64" || file.size > 40000) throw new Error("Unsupported source file.");
      const source = Buffer.from(file.content, "base64").toString("utf8");
      if (source.includes("\0") || source.includes("\ufffd")) throw new Error("Unsupported source text.");
      return { path, source };
    }));
    for (const { path, source } of contents) {
      bytes += Buffer.byteLength(source);
      if (bytes > 120000) throw new Error("Selected source exceeds the inspection limit.");
      files[path] = source;
    }
    return { sha, files };
  }
  // A selected branch head is not automatically the code serving a custom domain.
  let deploymentVerified = false;
  try {
    const target = new URL(run.target_url);
    const deployments = await get("/deployments?per_page=10");
    for (const d of deployments.slice(0, 10)) {
      const statuses = await get(`/deployments/${d.id}/statuses?per_page=1`);
      const latest = statuses[0];
      if (latest?.state === "success" && new URL(latest.environment_url || d.environment_url).origin === target.origin) {
        deploymentVerified = d.sha === sha; break;
      }
    }
  } catch { /* Unverified deployment provenance stays explicit in the report. */ }
  return { sha, paths, deploymentVerified };
}
