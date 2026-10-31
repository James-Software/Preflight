import { getProject, getRunReport } from "@/lib/schema";
import { getSql } from "@/lib/db";
import { loadGithubCredentials } from "@/lib/github-credentials";
import { fetchGithub, GITHUB_APP_SLUG } from "@/lib/github";
import { AgentAccessError, type RunAgentGrant } from "@/lib/run-agent-access";

const permissions = (value: any) =>
  Object.fromEntries(
    ["contents", "pull_requests"].map((key) => [
      key,
      ["read", "write"].includes(value?.[key]) ? value[key] : "none",
    ]),
  );
/** Diagnose the owner's existing connection without exporting credentials or making writes. */
export async function inspectGithubAccess(grant: RunAgentGrant) {
  if (
    grant.actor_id !== grant.owner_id ||
    /^(guest|test):/.test(grant.actor_id)
  )
    throw new AgentAccessError(
      "Only the project owner can inspect its GitHub connection.",
    );
  const project = await getProject(grant.project_id, grant.actor_id);
  const report =
    project && (await getRunReport(project.id, grant.run_id, grant.actor_id));
  const repo = report?.run.repo_full_name;
  if (
    !project ||
    !repo ||
    repo !== project.repo_full_name ||
    !/^[\w.-]+\/[\w.-]+$/.test(repo)
  )
    throw new AgentAccessError(
      "The run's repository is no longer connected to this project.",
    );
  const saved = await loadGithubCredentials(project.owner_github_id);
  if (!saved || saved.login.toLowerCase() !== repo.split("/")[0].toLowerCase())
    throw new AgentAccessError("The project owner needs to reconnect GitHub.");
  const ctx = { ...saved, ownerGithubId: project.owner_github_id };
  const checks: {
    operation: string;
    status: number;
    requestId: string | null;
  }[] = [];
  const read = async (path: string) => {
    const response = await fetchGithub(ctx, `https://api.github.com${path}`, {
      method: "GET",
      redirect: "error",
    });
    const id = response.headers.get("x-github-request-id");
    checks.push({
      operation: `GET ${path.split("?")[0]}`,
      status: response.status,
      requestId: id && /^[\w:-]{1,100}$/.test(id) ? id : null,
    });
    return response.ok ? response.json() : null;
  };
  const app = await read(`/apps/${GITHUB_APP_SLUG}`);
  const repository = await read(`/repos/${repo}`);
  await read(`/repos/${repo}/pulls?state=open&per_page=1`);
  let installation: any = null;
  let installationSearchComplete = false;
  for (let page = 1; page <= 4; page++) {
    const data = await read(`/user/installations?per_page=100&page=${page}`);
    if (!data || !Array.isArray(data.installations)) break;
    installation = data.installations.find(
      (item: any) =>
        item.app_slug === GITHUB_APP_SLUG &&
        item.account?.login?.toLowerCase() === repo.split("/")[0].toLowerCase(),
    );
    if (
      installation ||
      data.total_count <= page * 100 ||
      data.installations.length < 100
    ) {
      installationSearchComplete = true;
      break;
    }
  }
  let repositoryIncluded: boolean | null = null;
  if (installation && Number.isSafeInteger(installation.id)) {
    for (let page = 1; page <= 10; page++) {
      const data = await read(
        `/user/installations/${installation.id}/repositories?per_page=100&page=${page}`,
      );
      if (!data || !Array.isArray(data.repositories)) break;
      if (
        data.repositories.some(
          (item: any) => item.full_name?.toLowerCase() === repo.toLowerCase(),
        )
      ) {
        repositoryIncluded = true;
        break;
      }
      if (data.total_count <= page * 100 || data.repositories.length < 100) {
        repositoryIncluded = false;
        break;
      }
    }
  }
  const registered = permissions(app?.permissions),
    approved = permissions(installation?.permissions);
  const rows =
    await getSql()`SELECT error_summary FROM fix_pr_groups WHERE run_id=${grant.run_id} AND error_summary LIKE 'GitHub %' ORDER BY created_at DESC LIMIT 1`;
  return {
    repository: repo,
    app: {
      slug: GITHUB_APP_SLUG,
      configuredLoginMatches: app?.client_id
        ? app.client_id === process.env.AUTH_GITHUB_ID
        : null,
      registeredPermissions: registered,
    },
    installation: installation
      ? {
          id: installation.id,
          settingsUrl: `https://github.com/settings/installations/${installation.id}`,
          approvedPermissions: approved,
          repositoryIncluded,
          suspended: !!installation.suspended_at,
        }
      : null,
    installationSearchComplete,
    repositoryAccess: {
      readable: !!repository,
      accountCanPush: repository?.permissions?.push === true,
      archived: repository?.archived === true,
      disabled: repository?.disabled === true,
    },
    checks,
    lastPrError: (rows as any[])[0]?.error_summary || null,
    limitation:
      "Read-only inspection. Registered App permissions and approved installation permissions are separate. These reads do not prove a repository write will succeed.",
  };
}
