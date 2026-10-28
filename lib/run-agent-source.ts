import { getSql } from "@/lib/db";
import { getProject, getRunReport } from "@/lib/schema";
import { loadGithubCredentials } from "@/lib/github-credentials";
import { fetchGithub } from "@/lib/github";
import { investigationSourcePath } from "@/lib/check-investigation";
import { AgentAccessError, type RunAgentGrant } from "@/lib/run-agent-access";

export async function readRunAgentSource(grant: RunAgentGrant, selected?: string[]) {
  const project = await getProject(grant.project_id, grant.actor_id, "member");
  const report = project && await getRunReport(project.id, grant.run_id, grant.actor_id);
  const sha = report?.run.target_sha, repo = report?.run.repo_full_name;
  if (!project || !repo || repo !== project.repo_full_name || !/^[a-f0-9]{40}$/i.test(sha || ""))
    throw new AgentAccessError("The run's pinned source is unavailable. Do not substitute the latest main branch.");
  const saved = await loadGithubCredentials(project.owner_github_id);
  if (!saved || saved.login.toLowerCase() !== repo.split("/")[0].toLowerCase())
    throw new AgentAccessError("The project owner needs to reconnect GitHub before source can be read.");
  const ctx = { ...saved, ownerGithubId: project.owner_github_id,
    ...(grant.actor_id !== project.owner_github_id ? { projectGrant: { projectId: project.id, actor: grant.actor_id, owner: project.owner_github_id, repo } } : {}) };
  const read = async (path: string) => {
    const response = await fetchGithub(ctx, `https://api.github.com/repos/${repo}${path}`, { redirect: "error", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new AgentAccessError("The pinned source could not be read from GitHub.");
    return response.json();
  };
  const tree = await read(`/git/trees/${sha}?recursive=1`);
  if (tree.truncated || !Array.isArray(tree.tree)) throw new AgentAccessError("The repository exceeds the source inspection limit.");
  const paths: string[] = tree.tree.filter((n: any) => n.type === "blob" && ["100644", "100755"].includes(n.mode) &&
    Number.isFinite(n.size) && n.size <= 40000 && investigationSourcePath(n.path)).map((n: any) => n.path);
  if (paths.length > 2500) throw new AgentAccessError("The repository exceeds the source inspection limit.");
  const provenance = "Run-selected commit; the code serving the deployment has not been independently matched. Flag this limit in your assessment.";
  if (!selected) return { commit: sha, provenance, paths };
  if (!selected.length || selected.length > 6 || selected.some((p) => !paths.includes(p)))
    throw new AgentAccessError("Select up to six supported paths from get_source's file list.");
  const results = await Promise.all([...new Set(selected)].map(async (path) => {
    const file = await read(`/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${sha}`);
    if (file.type !== "file" || file.encoding !== "base64" || file.size > 40000) throw new AgentAccessError("Unsupported source file.");
    const content = Buffer.from(file.content, "base64").toString("utf8");
    if (content.includes("\0") || content.includes("\ufffd")) throw new AgentAccessError("Unsupported source text.");
    return { path, content };
  }));
  if (results.reduce((n, f) => n + Buffer.byteLength(f.content), 0) > 120000)
    throw new AgentAccessError("Select a smaller source group (120 KB maximum).");
  for (const file of results) await getSql()`INSERT INTO run_agent_source_reads(grant_id,path,sha,line_count)
    VALUES(${grant.id}::uuid,${file.path},${sha},${file.content.split("\n").length})
    ON CONFLICT(grant_id,path) DO UPDATE SET sha=EXCLUDED.sha,line_count=EXCLUDED.line_count`;
  return { commit: sha, provenance, files: results };
}
