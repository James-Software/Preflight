import {
  automaticDatabase,
  automaticDatabaseUnavailable,
} from "@/lib/automatic-database";
import {
  runDatabaseVerifier,
  databaseVerificationError,
} from "@/lib/database-verification";
import { DatabaseCheckError } from "@/lib/database-check-config";
import { getRunAuthentication } from "@/lib/auth-profiles";
import { authenticatedPage, profileRedactor } from "@/lib/browser-auth";
import { task } from "@trigger.dev/sdk";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Page } from "playwright-core";
import { createBrowserSession, closeBrowserSession } from "@/lib/browserbase";
import {
  driverDecide,
  judgeStep,
  assessSeverity,
  type AgentAction,
} from "@/lib/models";
import { uploadScreenshot } from "@/lib/evidence";
import { MODEL_CONFIG } from "@/lib/model-config";
import { createAgent, updateAgentStatus, createFinding } from "@/lib/schema";

export type PlanStep = {
  id: string;
  title: string;
  detail: string;
  databaseCheckId?: string;
};
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
    authProfileId?: number;
    verifyDatabase?: boolean;
  }) => {
    const agent = await createAgent(payload.runId, payload.assignment);
    const consoleLogs: string[] = [];
    const networkErrors: { url: string; status?: number; failure?: string }[] =
      [];
    const actionLog: string[] = [];
    let sessionId: string | null = null;
    let databaseVerifier: Awaited<
      ReturnType<typeof runDatabaseVerifier>
    > | null = null;
    let databaseCheckId: string | null = null;
    let automatic: Awaited<ReturnType<typeof automaticDatabase>> = null;
    let redact = (text: string) => text;
    let findingsCount = 0;
    let actionsUsed = 0;
    let stepLogStart = 0;
    let stepConsoleStart = 0;
    let stepNetworkStart = 0;

    const recordFinding = async (
      page: Page,
      title: string,
      detail: string,
    ): Promise<void> => {
      try {
        const shot = await page.screenshot({ type: "jpeg", quality: 60 });
        let screenshotUrl: string | null = null;
        try {
          screenshotUrl = await uploadScreenshot(
            payload.runId,
            payload.agentIndex,
            actionsUsed,
            Buffer.from(shot),
          );
        } catch {
          screenshotUrl = null;
        }
        title = redact(title);
        detail = redact(detail);
        let severity = "medium";
        try {
          severity = (await assessSeverity({ title, detail })).severity;
        } catch (error) {
          if (MODEL_CONFIG.judge.provider === "openai-decisions") throw error;
          // Legacy providers retain the default severity when triage is unavailable.
        }
        await createFinding({
          runId: payload.runId,
          agentId: agent.id,
          severity,
          title: title.slice(0, 200),
          reproSteps:
            actionLog.slice(stepLogStart).join("\n").slice(0, 4000) || null,
          screenshotUrl,
          consoleLogs:
            consoleLogs
              .slice(stepConsoleStart)
              .slice(-30)
              .join("\n")
              .slice(0, 4000) || null,
          networkErrors: networkErrors.slice(stepNetworkStart),
        });
        findingsCount++;
      } catch (e) {
        consoleLogs.push(
          `[finding-error] ${e instanceof Error ? e.message : String(e)}`.slice(
            0,
            300,
          ),
        );
        if (MODEL_CONFIG.judge.provider === "openai-decisions") throw e;
      }
    };

    try {
      await updateAgentStatus(agent.id, "running");
      const authentication = payload.authProfileId
        ? await getRunAuthentication(payload.runId)
        : null;
      if (authentication) redact = profileRedactor(authentication);
      const session = await createBrowserSession(!!authentication);
      sessionId = session.id;
      const browser = await chromium.connectOverCDP(session.connectUrl);
      const page = authentication
        ? await authenticatedPage(browser, authentication)
        : await browser.newPage({
            viewport: { width: 1280, height: 800 },
          });

      page.on("console", (msg) => {
        if (msg.type() === "error" || msg.type() === "warning") {
          consoleLogs.push(
            redact(`[${msg.type()}] ${msg.text()}`).slice(0, 500),
          );
        }
      });
      page.on("pageerror", (err) =>
        consoleLogs.push(redact(`[pageerror] ${String(err).slice(0, 500)}`)),
      );
      page.on("requestfailed", (req) => {
        networkErrors.push({
          url: redact(req.url()).slice(0, 300),
          failure: req.failure()?.errorText,
        });
      });
      page.on("response", (res) => {
        if (res.status() >= 400) {
          networkErrors.push({
            url: redact(res.url()).slice(0, 300),
            status: res.status(),
          });
        }
      });

      actionLog.push(
        await executeAction(page, {
          action: "goto",
          value: authentication
            ? new URL(authentication.verification_path, authentication.origin)
                .href
            : payload.appUrl,
          reasoning: "start the assignment at the app",
        }),
      );
      actionsUsed++;

      for (const [stepIndex, step] of payload.assignment.steps.entries()) {
        if (actionsUsed >= MAX_ACTIONS) {
          throw new Error(
            "Browser agent reached its action budget before all steps were tested.",
          );
        }
        // Keep initial navigation evidence for the first step, then isolate each goal.
        if (stepIndex > 0) {
          stepLogStart = actionLog.length;
          stepConsoleStart = consoleLogs.length;
          stepNetworkStart = networkErrors.length;
        }
        actionLog.push(redact(`Start step at ${page.url()}`));
        if (step.databaseCheckId) {
          databaseCheckId = step.databaseCheckId;
          databaseVerifier = await runDatabaseVerifier(
            payload.runId,
            step.databaseCheckId,
          );
        }
        let markerUsed = false;
        if (payload.verifyDatabase && !step.databaseCheckId) {
          try {
            automatic = await automaticDatabase(
              payload.runId,
              payload.agentIndex,
              stepIndex,
            );
          } catch {
            await automaticDatabaseUnavailable(
              payload.runId,
              payload.agentIndex,
              stepIndex,
            );
          }
        }
        let databaseObserved = false;
        let finished =
          payload.verifyDatabase === true &&
          step.id === "automatic-database-create" &&
          !automatic?.supported;
        for (
          let attempt = 0;
          !finished &&
          attempt <
            (step.id === "automatic-database-create"
              ? 12
              : MAX_ACTIONS_PER_STEP) &&
          actionsUsed < MAX_ACTIONS;
          attempt++
        ) {
          await automatic?.assertActive();
          const screenshot = await page.screenshot({
            type: "jpeg",
            quality: 50,
          });
          const axTree = (await page.locator("body").ariaSnapshot()).slice(
            0,
            20000,
          );

          let action: AgentAction;
          try {
            action = await driverDecide({
              goal: `Step: ${step.title}. ${step.detail} ${automatic?.instructions || ""}`,
              history: actionLog.slice(stepLogStart).slice(-10),
              axTree: redact(axTree),
              consoleLogs: consoleLogs.slice(stepConsoleStart).slice(-10),
              screenshotBase64: screenshot.toString("base64"),
            });
          } catch (error) {
            // A driver/model failure says nothing about whether the app is broken.
            // Propagate it before judging or creating a finding for this step.
            throw new Error(
              `Browser driver failed during "${step.title}". This test step was not evaluated.`,
              { cause: error },
            );
          }
          actionLog.push(redact(describeAction(action)));
          actionsUsed++;

          if (action.action === "done") {
            finished = true;
            break;
          }
          if (action.action === "report_bug") {
            finished = true;
            await recordFinding(page, action.title, action.detail);
            break;
          }
          if (
            databaseVerifier &&
            action.action === "click" &&
            action.role.toLowerCase() === "button" &&
            action.name.trim().toLowerCase() ===
              databaseVerifier.check.buttonLabel.toLowerCase()
          ) {
            const before = await databaseVerifier.before();
            try {
              await page
                .getByRole("button", {
                  name: databaseVerifier.check.buttonLabel,
                  exact: true,
                })
                .click({ timeout: 6000 });
            } catch {
              actionLog.push(
                "Action failed: the configured button was not uniquely available for this workflow.",
              );
              continue;
            }
            actionLog.push(
              `Clicked the configured button "${databaseVerifier.check.buttonLabel}".`,
            );
            const outcome = await databaseVerifier.after(before);
            databaseObserved = true;
            finished = true;
            if (!outcome.passed)
              await recordFinding(
                page,
                `Database change not confirmed: ${step.title}`,
                outcome.summary,
              );
            break;
          }
          await automatic?.assertActive();
          if (
            automatic &&
            action.action === "fill" &&
            action.value.includes(automatic.marker)
          )
            markerUsed = true;
          const observe =
            automatic &&
            markerUsed &&
            ((action.action === "click" &&
              action.role.toLowerCase() === "button" &&
              /create|save|add|submit|update|delete|remove|confirm|publish|send|done|finish/i.test(
                action.name,
              )) ||
              (action.action === "press" && action.key === "Enter"));
          let before: Awaited<
            ReturnType<NonNullable<typeof automatic>["before"]>
          > | null = null;
          if (observe && automatic) {
            try {
              before = await automatic.before();
            } catch {
              await automaticDatabaseUnavailable(
                payload.runId,
                payload.agentIndex,
                stepIndex,
              );
              await automatic.close();
              automatic = null;
              throw new DatabaseCheckError(
                "Database verification became unavailable before the action. No further test changes were attempted.",
              );
            }
          }
          const result = await executeAction(page, action);
          actionLog.push(redact(`  → ${result}`));
          if (before && automatic) {
            try {
              await automatic.after(
                before,
                action.action === "click" ? action.name : "Enter",
              );
            } catch {
              await automaticDatabaseUnavailable(
                payload.runId,
                payload.agentIndex,
                stepIndex,
              );
            }
          }
          // Gentle on free-tier rate limits.
          await delay(1000);
        }

        if (
          payload.verifyDatabase &&
          !markerUsed &&
          step.id === "automatic-database-create"
        )
          await automaticDatabaseUnavailable(
            payload.runId,
            payload.agentIndex,
            stepIndex,
            "No supported create workflow was exercised with a unique test marker. Database persistence has not been verified.",
          );
        await automatic?.close();
        automatic = null;
        if (!finished) {
          throw new Error(
            `Browser agent reached its action budget during "${step.title}". This test step was not evaluated.`,
          );
        }

        if (databaseVerifier) {
          if (!databaseObserved) {
            await databaseVerifier.inconclusive();
            throw new DatabaseCheckError(
              "The configured browser workflow did not activate its database-verified button.",
            );
          }
          await databaseVerifier.close();
          databaseVerifier = null;
          databaseCheckId = null;
          continue; // The deterministic database assertion is the verdict for this workflow.
        }

        // Judge only completed observations, never model/runner errors.
        try {
          const verdict = await judgeStep({
            stepTitle: step.title,
            stepDetail: step.detail,
            observation: redact(
              [
                `Current URL: ${page.url()}`,
                `Current page: ${(await page.locator("body").ariaSnapshot()).slice(0, 4000)}`,
                `This step's actions:`,
                ...actionLog.slice(stepLogStart),
                `Console output: ${consoleLogs.slice(stepConsoleStart).slice(-5).join(" | ") || "none"}`,
                `Network errors: ${
                  networkErrors
                    .slice(stepNetworkStart)
                    .slice(-5)
                    .map((n) => n.url)
                    .join(" | ") || "none"
                }`,
              ].join("\n"),
            ),
          });
          if (verdict.verdict === "fail") {
            await recordFinding(
              page,
              `Step failed: ${step.title}`,
              `The agent could not complete this step.\n${actionLog.slice(stepLogStart).join("\n")}`,
            );
          }
        } catch (error) {
          // A failed/refused decision is not a completed QA test.
          if (MODEL_CONFIG.judge.provider === "openai-decisions") throw error;
          console.warn("QA step judge unavailable", error);
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
      if (databaseCheckId)
        await databaseVerificationError(
          payload.runId,
          databaseCheckId,
          e instanceof DatabaseCheckError
            ? e.message
            : "The browser workflow did not complete. This database check is unverified.",
        ).catch(() => {});
      await updateAgentStatus(agent.id, "failed").catch(() => {});
      throw e;
    } finally {
      await automatic?.close().catch(() => {});
      await databaseVerifier?.close().catch(() => {});
      if (sessionId) await closeBrowserSession(sessionId).catch(() => {});
    }
  },
});
