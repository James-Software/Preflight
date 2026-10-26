import { task } from "@trigger.dev/sdk";
import { chromium } from "playwright-core";
import { getSql } from "@/lib/db";
import { profileProject } from "@/lib/auth-profiles";
import {
  browserConnectUrl,
  browserLiveUrl,
  createBrowserSession,
  closeBrowserSession,
} from "@/lib/browserbase";
import { finishProfileCapture } from "@/lib/profile-capture";
import {
  generationToken,
  openTestAccount,
  generationMessages,
  sealGenerationLiveUrl,
} from "@/lib/profile-generation";
import {
  setupView,
  decideSetup,
  applySetupAction,
  verifyGeneratedAccess,
} from "@/lib/profile-generation-browser";

export const generateAuthProfile = task({
  id: "generate-auth-profile",
  maxDuration: 540,
  retry: { maxAttempts: 1 },
  run: async (payload: {
    owner: string;
    projectId: number;
    captureId: string;
  }) => {
    await profileProject(payload.owner, payload.projectId);
    const sql = getSql(),
      token = generationToken();
    const rows =
      await sql`UPDATE profile_captures SET automation_status='running',automation_message=${generationMessages.running},automation_token=${token}::uuid
      WHERE id=${payload.captureId}::uuid AND owner_github_id=${payload.owner} AND project_id=${payload.projectId} AND status='active' AND automation_status='queued' AND expires_at>NOW() RETURNING *`;
    const capture = (rows as any[])[0];
    if (!capture) return { status: "unavailable" };
    let browser:
      | Awaited<ReturnType<typeof chromium.connectOverCDP>>
      | undefined;
    let context:
      | ReturnType<NonNullable<typeof browser>["contexts"]>[number]
      | undefined;
    let guard: Parameters<NonNullable<typeof context>["route"]>[1] | undefined;
    let unlocked = false;
    async function active() {
      const result =
        await sql`SELECT id FROM profile_captures WHERE id=${payload.captureId}::uuid AND owner_github_id=${payload.owner} AND project_id=${payload.projectId} AND automation_token=${token}::uuid AND status='active' AND expires_at>NOW()`;
      if (!(result as any[]).length) throw new Error("Setup no longer active");
    }
    async function handoff(
      reason: keyof typeof generationMessages,
      message = generationMessages[reason],
    ) {
      let live: string | null = null;
      if (unlocked && capture.session_id) {
        try {
          live = sealGenerationLiveUrl(
            await browserLiveUrl(capture.session_id),
            payload.owner,
            capture.origin,
            capture.id,
          );
        } catch {
          message +=
            " The browser link could not be restored. Cancel setup and try again.";
        }
      }
      await sql`UPDATE profile_captures SET automation_status='waiting',automation_message=${message},automation_live_url=COALESCE(${live},automation_live_url),automation_token=NULL WHERE id=${payload.captureId}::uuid AND owner_github_id=${payload.owner} AND project_id=${payload.projectId} AND status='active' AND automation_token=${token}::uuid`;
      return { status: "waiting" };
    }
    async function fail(message: string) {
      await sql`UPDATE profile_captures SET status='error',automation_message=${message},automation_credentials=NULL,automation_live_url=NULL WHERE id=${capture.id}::uuid AND owner_github_id=${payload.owner} AND project_id=${payload.projectId} AND status='active' AND automation_token=${token}::uuid`;
      return { status: "error" };
    }
    try {
      let account: ReturnType<typeof openTestAccount>;
      try {
        account = openTestAccount(
          capture.automation_credentials,
          payload.owner,
          capture.origin,
          capture.id,
        );
      } catch {
        return await handoff(
          "failed",
          "Could not unlock automatic setup. Cancel setup, check that PROFILE_ENCRYPTION_KEY matches in Vercel and Trigger.dev, then generate a new profile.",
        );
      }
      unlocked = true;
      if (!process.env.BROWSERBASE_API_KEY?.trim())
        return await fail(
          "BROWSERBASE_API_KEY is missing in Trigger.dev. Add the same browser credentials used by swarm runs, redeploy the worker, then generate a new profile.",
        );
      if (!process.env.OPENROUTER_API_KEY?.trim())
        return await fail(
          "OPENROUTER_API_KEY is missing in Trigger.dev. Add the browser driver's key, redeploy the worker, then generate a new profile.",
        );
      const fresh = !capture.session_id;
      if (fresh) {
        const remaining =
          Math.floor(
            (new Date(capture.expires_at).getTime() - Date.now()) / 1000,
          ) - 10;
        if (remaining < 60)
          return await fail(
            "This setup expired before its browser could start. Generate a new profile to try again.",
          );
        const session = await createBrowserSession(true, true, remaining);
        capture.session_id = session.id;
        const linked =
          await sql`UPDATE profile_captures SET session_id=${session.id} WHERE id=${capture.id}::uuid AND status='active' AND automation_token=${token}::uuid AND expires_at>NOW() RETURNING id`;
        if (!(linked as any[]).length) {
          await closeBrowserSession(session.id).catch(() => {});
          return { status: "unavailable" };
        }
      }
      browser = await chromium.connectOverCDP(
        browserConnectUrl(capture.session_id),
        { timeout: 15_000 },
      );
      context = browser.contexts()[0];
      if (!context) throw new Error("No browser");
      const pages = context.pages();
      // OAuth and some verification flows return in a new tab. Resume the
      // latest app tab rather than the original, now-stale sign-in form.
      const page =
        pages
          .filter((page) => {
            try {
              return new URL(page.url()).origin === capture.origin;
            } catch {
              return false;
            }
          })
          .at(-1) ||
        pages.at(-1) ||
        (await context.newPage());
      if (fresh)
        await page.goto(capture.origin, {
          waitUntil: "domcontentloaded",
          timeout: 25_000,
        });
      let external = false;
      // During automation, the agent never leaves the project's app. Remove
      // this guard before human handoff so the owner can complete OAuth.
      guard = async (route) => {
        const req = route.request();
        if (
          req.isNavigationRequest() &&
          !req.frame().parentFrame() &&
          new URL(req.url()).origin !== capture.origin
        ) {
          external = true;
          await route.abort();
        } else await route.fallback();
      };
      await context.route("**/*", guard);
      const history: string[] = [];
      const deadline = Math.min(
        Date.now() + 450_000,
        new Date(capture.expires_at).getTime() - 10_000,
      );
      for (let step = 0; step < 18 && Date.now() < deadline; step++) {
        await active();
        const current = new URL(page.url());
        if (external || current.origin !== capture.origin) {
          const original = new URL(capture.origin);
          if (
            current.protocol === "https:" &&
            current.hostname.replace(/^www\./, "") ===
              original.hostname.replace(/^www\./, "") &&
            current.origin !== original.origin
          )
            return await handoff(
              "unsupported",
              `Your app redirects to ${current.origin}. Cancel setup, update the App URL in General info to that address, then generate a new profile.`,
            );
          return await handoff("oauth");
        }
        let view: Awaited<ReturnType<typeof setupView>>;
        try {
          await page.waitForLoadState("domcontentloaded", { timeout: 5000 });
          view = await setupView(page, account);
        } catch {
          // Client-side auth redirects may replace the document as we inspect
          // it, especially immediately after the owner resumes verification.
          await page.waitForTimeout(500);
          continue;
        }
        try {
          const action = await decideSetup({
            ...view.input,
            resuming: !!capture.automation_resume,
            history,
          });
          await active();
          if (action.action === "handoff")
            return await handoff(
              action.reason in generationMessages
                ? action.reason
                : "unsupported",
            );
          if (action.action === "verify") {
            await sql`UPDATE profile_captures SET automation_message=${generationMessages.verifying} WHERE id=${capture.id}::uuid AND automation_token=${token}::uuid AND status='active'`;
            try {
              const proof = await verifyGeneratedAccess(
                browser,
                page,
                capture.origin,
                action.marker,
              );
              await active();
              await sql`UPDATE profile_captures SET verification_path=${proof.path},verification_text=${proof.text} WHERE id=${capture.id}::uuid AND automation_token=${token}::uuid AND status='active' AND expires_at>NOW()`;
              await finishProfileCapture(
                payload.owner,
                capture.id,
                payload.projectId,
                false,
                token,
              );
              return { status: "completed" };
            } catch {
              history.push(
                "Verification did not confirm a replayable signed-in session. Finish signing in or expose a Sign out menu item; do not create another account.",
              );
            }
          } else {
            try {
              const result = await applySetupAction(
                page,
                view,
                action,
                account,
                capture.origin,
              );
              if (result === "oauth") return await handoff("oauth");
              history.push(
                `${action.action} control ${action.index}${action.action === "fill" ? ` using ${action.field}` : ""}`,
              );
              await page.waitForTimeout(700);
            } catch {
              history.push(
                "The action did not complete. Inspect the updated controls before trying again.",
              );
            }
          }
        } finally {
          await Promise.allSettled(
            view.handles.map((handle) => handle.dispose()),
          );
        }
      }
      return await handoff("unsupported");
    } catch {
      if (!capture.session_id)
        return await fail(
          "Could not open the private browser in Trigger.dev. Check BROWSERBASE_API_KEY, the Browserbase project and interactive-session support, then try again.",
        );
      return await handoff("failed");
    } finally {
      if (context && guard)
        await context.unroute("**/*", guard).catch(() => {});
      await browser?.close().catch(() => {}); // keepAlive preserves the private live browser.
      if (capture.session_id) {
        const current =
          await sql`SELECT status FROM profile_captures WHERE id=${capture.id}::uuid AND owner_github_id=${payload.owner} AND project_id=${payload.projectId}`;
        const row = (current as { status: string }[])[0];
        if (row && !["active", "saving"].includes(row.status))
          await closeBrowserSession(capture.session_id).catch(() => {});
      }
    }
  },
});
