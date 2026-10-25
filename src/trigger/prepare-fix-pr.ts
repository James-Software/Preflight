import { randomUUID } from "node:crypto";
import { task } from "@trigger.dev/sdk";
import { getSql } from "@/lib/db";
import { getProject, getRunReport } from "@/lib/schema";
import {
  openFixGithubGrant,
  clearFixGithubGrant,
} from "@/lib/fix-github-grant";
import {
  completeFixGroup,
  claimFixWork,
  releaseFixWork,
  failFixGroup,
  releaseFixGroupLease,
  type FixGroup,
} from "@/lib/fix-groups";
import { generateFixPatches } from "@/lib/generate-fix-patches";
import { openFixPullRequest } from "@/lib/fix-pull-request";
import { SITE_URL } from "@/lib/site";
export const prepareFixPr = task({
  id: "prepare-fix-pr",
  maxDuration: 300,
  retry: { maxAttempts: 1 },
  run: async (payload: {
    groupId: string;
    runId: number;
    projectId: number;
    owner: string;
  }) => {
    const sql = getSql();
    let usedGrant: string | null = null;
    const workToken = randomUUID();
    let ownsWork = false;
    try {
      const project = await getProject(payload.projectId, payload.owner),
        report =
          project &&
          (await getRunReport(payload.projectId, payload.runId, payload.owner));
      if (!project || !report)
        throw new Error("This report is no longer available.");
      const groups =
        await sql`SELECT * FROM fix_pr_groups WHERE id=${payload.groupId}::uuid AND run_id=${payload.runId}`;
      const group = (groups as unknown as FixGroup[])[0];
      if (!group) throw new Error("This PR group is unavailable.");
      if (group.pr_url) return { prUrl: group.pr_url };
      ownsWork = await claimFixWork(group.id, workToken);
      if (!ownsWork) return { status: "already-processing" };
      const findings = group.finding_ids.map((id) =>
        report.findings.find((f) => f.id === id),
      );
      if (findings.some((f) => !f || f.pr_group_id !== group.id))
        throw new Error("The selected findings changed. Refresh the report.");
      const selected = findings as NonNullable<(typeof findings)[number]>[];
      usedGrant = group.github_grant || null;
      if (!usedGrant)
        throw new Error(
          "The GitHub authorization for this PR is missing. Retry the PR to reconnect it.",
        );
      const ctx = openFixGithubGrant(usedGrant, group.id, payload.owner),
        repo = report.run.repo_full_name || project.repo_full_name;
      if (selected.some((f) => !f.patch_diff?.trim())) {
        const generated = await generateFixPatches(ctx, repo, selected);
        // All results validate before any proposed code change is saved.
        for (const fix of generated) {
          await sql`INSERT INTO diagnoses(finding_id,root_cause,patch_diff,confidence) VALUES(${fix.id},${fix.summary},${fix.patch},'proposed') ON CONFLICT(finding_id) DO UPDATE SET root_cause=EXCLUDED.root_cause,patch_diff=EXCLUDED.patch_diff,confidence=EXCLUDED.confidence`;
          await sql`UPDATE findings SET fix_summary=${fix.summary} WHERE id=${fix.id} AND run_id=${payload.runId} AND pr_group_id=${group.id}::uuid`;
          const finding = selected.find((f) => f.id === fix.id)!;
          finding.patch_diff = fix.patch;
        }
      }
      const pr = await openFixPullRequest(
        ctx,
        repo,
        group.branch,
        selected,
        `${SITE_URL}/dashboard/projects/${payload.projectId}/runs/${payload.runId}`,
        true,
      );
      await completeFixGroup(group.id, pr.html_url, pr.number);
      return { prUrl: pr.html_url };
    } catch (error) {
      const message =
        error instanceof Error &&
        !!error.message.trim() &&
        !(error instanceof SyntaxError) &&
        !/^OpenRouter/.test(error.message)
          ? error.message.slice(0, 500)
          : "The fix model could not prepare code changes. Retry this group or copy its prompts for manual use.";
      if (ownsWork) await failFixGroup(payload.groupId, message);
      throw new Error(message);
    } finally {
      if (ownsWork) {
        if (usedGrant)
          await clearFixGithubGrant(payload.groupId, usedGrant).catch(() => {});
        await releaseFixWork(payload.groupId, workToken);
        await releaseFixGroupLease(payload.groupId);
      }
    }
  },
});
