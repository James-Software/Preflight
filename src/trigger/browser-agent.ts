import { task } from "@trigger.dev/sdk";
import { chromium, type Page } from "playwright-core";
import { createBrowserSession, closeBrowserSession } from "@/lib/browserbase";
import {
  driverDecide,
  judgeStep,
  assessSeverity,
  type AgentAction,
} from "@/lib/models";
import { uploadScreenshot } from "@/lib/evidence";
import { createAgent, updateAgentStatus, createFinding } from "@/lib/schema";

export type PlanStep = { id: string; title: string; detail: string };
export type Assignment = { goal: string; steps: PlanStep[] };

const MAX_ACTIONS = 15;
const MAX_ACTIONS_PER_STEP = 6;

type AriaRole = Parameters<Page["getByRole"]>[0];

function describeAction(a: AgentAction): string {
  switch (a.action) {
    case "click":
      return `click ${a.role} "${a.name}" — ${a.reasoning}`;
    case "fill":
      return `fill ${a.role} "${a.name}" with "${a.value.slice(0, 60)}" — ${a.reasoning}`;
    case "goto":
      return `go to ${a.value} — ${a.reasoning}`;
    case "wait":
      return `wait ${a.value}ms — ${a.reasoning}`;
    case "scroll":
      return `scroll ${a.direction} — ${a.reasoning}`;
    case "press":
      return `press ${a.key} on ${a.role} "${a.name}" — ${a.reasoning}`;
    case "done":
      return `done — ${a.reasoning}`;
    case "report_bug":
      return `BUG REPORTED: ${a.title} — ${a.detail}`;
  }
}

/** Execute one driver action. Never throws — failures come back as text. */
async function executeAction(page: Page, action: AgentAction): Promise<string> {
  try {
    switch (action.action) {
      case "click": {
        const el = page.getByRole(action.role as AriaRole, {
          name: action.name,
        });
        await el.first().click({ timeout: 6000 });
        return `Clicked ${action.role} "${action.name}".`;
      }
      case "fill": {
        const el = page.getByRole(action.role as AriaRole, {
          name: action.name,
        });
        await el.first().fill(action.value, { timeout: 6000 });
        return `Filled ${action.role} "${action.name}".`;
      }
      case "goto": {
        await page.goto(action.value, {
          waitUntil: "domcontentloaded",
          timeout: 20000,
        });
        return `Navigated to ${action.value}.`;
      }
      case "wait": {
        await page.waitForTimeout(action.value);
        return `Waited ${action.value}ms.`;
      }
      case "scroll": {
        await page.mouse.wheel(0, action.direction === "up" ? -600 : 600);
        await page.waitForTimeout(500);
        return `Scrolled ${action.direction}.`;
      }
      case "press": {
        const el = page.getByRole(action.role as AriaRole, {
          name: action.name,
        });
        await el.first().press(action.key, { timeout: 6000 });
        return `Pressed ${action.key} on ${action.role} "${action.name}".`;
      }
      case "done":
      case "report_bug":
        return "No browser action needed.";
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `Action failed: ${msg.split("\n")[0].slice(0, 300)}`;
  }
}

/**
 * browser-agent — one swarm agent. Opens a real Browserbase browser, works
 * through its assignment step by step with the vision driver, judges each
 * step, and records findings with evidence. The session always closes.
 */
export const browserAgent = task({
  id: "browser-agent",
  maxDuration: 900,
  run: async (payload: {
    runId: number;
    agentIndex: number;
    assignment: Assignment;
    appUrl: string;
  }) => {
    const agent = await createAgent(payload.runId, payload.assignment);
    const consoleLogs: string[] = [];
    const networkErrors: { url: string; status?: number; failure?: string }[] =
      [];
    const actionLog: string[] = [];
    let sessionId: string | null = null;
    let findingsCount = 0;
    let actionsUsed = 0;

    const recordFinding = async (
      page: Page,
      title: string,
      detail: string
    ): Promise<void> => {
      try {
        const shot = await page.screenshot({ type: "jpeg", quality: 60 });
        let screenshotUrl: string | null = null;
        try {
          screenshotUrl = await uploadScreenshot(
            payload.runId,
            payload.agentIndex,
            actionsUsed,
            Buffer.from(shot)
          );
        } catch {
          screenshotUrl = null;
        }
        let severity = "medium";
        try {
          severity = (await assessSeverity({ title, detail })).severity;
        } catch {
          // keep medium
        }
        await createFinding({
          runId: payload.runId,
          agentId: agent.id,
          severity,
          title: title.slice(0, 200),
          reproSteps: actionLog.join("\n").slice(0, 4000) || null,
          screenshotUrl,
          consoleLogs: consoleLogs.slice(-30).join("\n").slice(0, 4000) || null,
          networkErrors,
        });
        findingsCount++;
      } catch (e) {
        consoleLogs.push(
          `[finding-error] ${e instanceof Error ? e.message : String(e)}`.slice(0, 300)
        );
      }
    };

    try {
      await updateAgentStatus(agent.id, "running");
      const session = await createBrowserSession();
      sessionId = session.id;
      const browser = await chromium.connectOverCDP(session.connectUrl);
      const page = await browser.newPage({
        viewport: { width: 1280, height: 800 },
      });

      page.on("console", (msg) => {
        if (msg.type() === "error" || msg.type() === "warning") {
          consoleLogs.push(`[${msg.type()}] ${msg.text()}`.slice(0, 500));
        }
      });
      page.on("pageerror", (err) =>
        consoleLogs.push(`[pageerror] ${String(err).slice(0, 500)}`)
      );
      page.on("requestfailed", (req) => {
        networkErrors.push({
          url: req.url().slice(0, 300),
          failure: req.failure()?.errorText,
        });
      });
      page.on("response", (res) => {
        if (res.status() >= 400) {
          networkErrors.push({ url: res.url().slice(0, 300), status: res.status() });
        }
      });

      actionLog.push(
        await executeAction(page, {
          action: "goto",
          value: payload.appUrl,
          reasoning: "start the assignment at the app",
        })
      );
      actionsUsed++;

      for (const step of payload.assignment.steps) {
        if (actionsUsed >= MAX_ACTIONS) break;
        for (
          let attempt = 0;
          attempt < MAX_ACTIONS_PER_STEP &&
          actionsUsed < MAX_ACTIONS;
          attempt++
        ) {
          const screenshot = await page.screenshot({
            type: "jpeg",
            quality: 50,
          });
          const axTree = (await page.locator("body").ariaSnapshot()).slice(0, 20000);

          let action: AgentAction;
          try {
            action = await driverDecide({
              goal: `Step: ${step.title}. ${step.detail}`,
              history: actionLog.slice(-10),
              axTree,
              consoleLogs: consoleLogs.slice(-10),
              screenshotBase64: screenshot.toString("base64"),
            });
          } catch (e) {
            actionLog.push(
              `driver error: ${(e as Error).message.slice(0, 200)}`
            );
            break;
          }
          actionLog.push(describeAction(action));
          actionsUsed++;

          if (action.action === "done") break;
          if (action.action === "report_bug") {
            await recordFinding(page, action.title, action.detail);
            break;
          }
          const result = await executeAction(page, action);
          actionLog.push(`  → ${result}`);
          // Gentle on free-tier rate limits.
          await new Promise((r) => setTimeout(r, 1000));
        }

        // Judge the step; a failure is itself a finding.
        try {
          const verdict = await judgeStep({
            stepTitle: step.title,
            stepDetail: step.detail,
            observation: [
              `Recent actions:`,
              ...actionLog.slice(-8),
              `Console errors: ${consoleLogs.slice(-5).join(" | ") || "none"}`,
              `Network errors: ${
                networkErrors.slice(-5).map((n) => n.url).join(" | ") || "none"
              }`,
            ].join("\n"),
          });
          if (verdict.verdict === "fail") {
            await recordFinding(
              page,
              `Step failed: ${step.title}`,
              `The agent could not complete this step.\n${actionLog.slice(-8).join("\n")}`
            );
          }
        } catch {
          // Judging is best-effort on the free tier; the evidence is kept.
        }
      }

      await updateAgentStatus(agent.id, "done");
      await browser.close().catch(() => {});
      return {
        agentIndex: payload.agentIndex,
        findings: findingsCount,
        status: "done",
      };
    } catch (e) {
      await updateAgentStatus(agent.id, "failed").catch(() => {});
      throw e;
    } finally {
      if (sessionId) await closeBrowserSession(sessionId).catch(() => {});
    }
  },
});
