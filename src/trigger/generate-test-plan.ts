import { task } from "@trigger.dev/sdk";
import { getSql } from "@/lib/db";

type PlanStep = {
  id: string;
  title: string;
  detail: string;
};

/**
 * generate-test-plan — Phase 2.
 * Takes a run, marks it planning, builds a smoke-test plan from the
 * project's app URL (homepage + discovered links/forms), saves the plan
 * to the run, and marks it planned. The LLM-generated plan from repo
 * analysis replaces the static builder in Phase 3.
 */
export const generateTestPlan = task({
  id: "generate-test-plan",
  maxDuration: 300,
  run: async (payload: { runId: number }) => {
    const sql = getSql();

    const rows = await sql`
      SELECT r.id AS run_id, r.target_url, p.app_url, p.repo_full_name
      FROM runs r
      JOIN projects p ON p.id = r.project_id
      WHERE r.id = ${payload.runId}
    `;
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error(`Run ${payload.runId} not found`);
    }
    const run = rows[0] as {
      run_id: number;
      target_url: string | null;
      app_url: string | null;
      repo_full_name: string;
    };

    await sql`
      UPDATE runs SET status = 'planning', started_at = NOW()
      WHERE id = ${payload.runId}
    `;

    const baseUrl = run.target_url ?? run.app_url;
    if (!baseUrl) {
      throw new Error(`Run ${payload.runId} has no target URL`);
    }
    const plan = await buildSmokePlan(baseUrl);

    await sql`
      UPDATE runs
      SET plan = ${JSON.stringify(plan)}::jsonb, status = 'planned'
      WHERE id = ${payload.runId}
    `;

    return { runId: payload.runId, steps: plan.length };
  },
});

/** Fetch the homepage and turn discovered links/forms into plan steps. */
async function buildSmokePlan(appUrl: string): Promise<PlanStep[]> {
  const steps: PlanStep[] = [
    {
      id: "homepage-load",
      title: "Homepage loads without errors",
      detail: `Navigate to ${appUrl}; capture console errors and take a screenshot.`,
    },
  ];

  try {
    const res = await fetch(appUrl, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      steps.push({
        id: "homepage-status",
        title: `Homepage returned HTTP ${res.status}`,
        detail: "Flag as a finding: the app URL did not return 200.",
      });
      return steps;
    }
    const html = await res.text();

    // Distinct internal links (cap at 10).
    const base = new URL(appUrl);
    const links = new Set<string>();
    for (const m of html.matchAll(/href="([^"#]+)"/g)) {
      try {
        const u = new URL(m[1], base);
        if (u.origin === base.origin && u.pathname !== base.pathname) {
          links.add(u.pathname);
        }
      } catch {
        // ignore malformed hrefs
      }
      if (links.size >= 10) break;
    }
    for (const pathname of links) {
      steps.push({
        id: `visit-${pathname.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root"}`,
        title: `Visit ${pathname}`,
        detail: `Navigate to ${pathname}; check for console errors, broken layout, and dead interactions.`,
      });
    }

    // Forms (cap at 5).
    const forms = html.match(/<form[^>]*>/gi) ?? [];
    forms.slice(0, 5).forEach((_, i) => {
      steps.push({
        id: `form-${i + 1}`,
        title: `Exercise form #${i + 1}`,
        detail: "Fill required fields with realistic input, submit, and verify the outcome (success message, redirect, or validation).",
      });
    });
  } catch {
    // Unreachable URL: keep the basic plan; the swarm will report the outage.
    steps.push({
      id: "url-unreachable",
      title: "App URL unreachable",
      detail: `Could not fetch ${appUrl}. Flag as a critical finding.`,
    });
  }

  return steps;
}
