import { task } from "@trigger.dev/sdk";
import { chromium } from "playwright-core";
import { getSql } from "@/lib/db";
import { profileProject } from "@/lib/auth-profiles";
import { browserConnectUrl } from "@/lib/browserbase";
import { finishProfileCapture } from "@/lib/profile-capture";
import {
  generationToken,
  openTestAccount,
  generationMessages,
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
    async function active() {
      const result =
        await sql`SELECT id FROM profile_captures WHERE id=${payload.captureId}::uuid AND owner_github_id=${payload.owner} AND project_id=${payload.projectId} AND automation_token=${token}::uuid AND status='active' AND expires_at>NOW()`;
      if (!(result as any[]).length) throw new Error("Setup no longer active");
    }
    async function handoff(
      reason: keyof typeof generationMessages,
      message = generationMessages[reason],
    ) {
      await sql`UPDATE profile_captures SET automation_status='waiting',automation_message=${message},automation_token=NULL WHERE id=${payload.captureId}::uuid AND owner_github_id=${payload.owner} AND project_id=${payload.projectId} AND status='active' AND automation_token=${token}::uuid`;
      return { status: "waiting" };
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
      return await handoff("failed");
    } finally {
      if (context && guard)
        await context.unroute("**/*", guard).catch(() => {});
      await browser?.close().catch(() => {}); // keepAlive preserves the private live browser.
    }
  },
});
