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
      SELECT r.id AS run_id, r.target_url, r.auth_profile_id, r.auth_profile_snapshot, p.app_url, COALESCE(r.repo_full_name,p.repo_full_name) AS repo_full_name
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
      auth_profile_id?: number | null;
      auth_profile_snapshot?: { verification_path: string };
    };

    await sql`
      UPDATE runs SET status = 'planning', started_at = NOW()
      WHERE id = ${payload.runId} AND status <> 'cancelled'
    `;

    const baseUrl = run.target_url ?? run.app_url;
    if (!baseUrl) {
      throw new Error(`Run ${payload.runId} has no target URL`);
    }
    const plan = run.auth_profile_id
      ? [
          {
            id: "signed-in-page",
            title: "Signed-in page loads",
            detail: `Navigate to ${new URL(run.auth_profile_snapshot?.verification_path || "/", baseUrl).href}. Check that the authenticated app loads and inspect visible controls.`,
          },
          {
            id: "signed-in-navigation",
            title: "Signed-in navigation works",
            detail:
              "Follow the main internal navigation links available to this test account. Check their layouts and primary controls. Do not log out or change security settings.",
          },
          {
            id: "signed-in-interaction",
            title: "Primary signed-in interaction responds",
            detail:
              "Exercise a primary non-destructive interaction or form validation in the authenticated app. Check the expected result and console errors. Do not make payments, delete data, change credentials or log out.",
          },
        ]
      : await buildSmokePlan(baseUrl);

    await sql`
      UPDATE runs
      SET plan = ${JSON.stringify(plan)}::jsonb, status = 'planned'
      WHERE id = ${payload.runId} AND status <> 'cancelled'
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
        detail:
          "Fill required fields with realistic input, submit, and verify the outcome (success message, redirect, or validation).",
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
