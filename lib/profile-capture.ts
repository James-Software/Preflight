import { profileProject } from "@/lib/auth-profiles";
import { randomUUID } from "node:crypto";
import { chromium, type BrowserContext } from "playwright-core";
import { getSql } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import {
  profileOrigin,
  profileKey,
  ProfileError,
  parseProfileState,
  encryptProfile,
} from "@/lib/auth-profile-state";
import { authenticatedPage } from "@/lib/browser-auth";
import {
  createBrowserSession,
  closeBrowserSession,
  browserConnectUrl,
  browserLiveUrl,
} from "@/lib/browserbase";

type CaptureRow = {
  id: string;
  session_id: string;
  origin: string;
  verification_path: string;
  verification_text: string;
  expires_at: string;
};
export function captureDetails(input: Record<string, unknown>) {
  if (
    typeof input.name !== "string" ||
    !input.name.trim() ||
    input.name.trim().length > 80 ||
    typeof input.origin !== "string"
  )
    throw new ProfileError("Enter a profile name and app URL.");
  const origin = profileOrigin(input.origin);
  const host = new URL(origin).hostname;
  if (
    !origin.startsWith("https://") ||
    !host.includes(".") ||
    host.endsWith(".localhost") ||
    /^[\d.]+$/.test(host) ||
    host.includes(":")
  )
    throw new ProfileError("Use a public HTTPS app URL.");
  if (
    typeof input.verificationPath !== "string" ||
    typeof input.verificationText !== "string" ||
    !input.verificationText.trim() ||
    input.verificationText.trim().length > 200
  )
    throw new ProfileError(
      "Enter a protected page and text visible only after signing in.",
    );
  const page = new URL(input.verificationPath || "/", origin);
  if (
    page.origin !== origin ||
    page.search ||
    page.hash ||
    page.username ||
    page.password ||
    /\/(?:log-?in|sign-?in)(?:\/|$)/i.test(page.pathname)
  )
    throw new ProfileError(
      "Use a signed-in page path on this app, without query parameters.",
    );
  return {
    name: input.name.trim(),
    origin,
    path: page.pathname,
    text: input.verificationText.trim(),
  };
}
export function scopedCaptureState(
  origin: string,
  state: Awaited<ReturnType<BrowserContext["storageState"]>>,
) {
  const hostname = new URL(origin).hostname;
  return parseProfileState(
    origin,
    JSON.stringify({
      cookies: state.cookies.filter((c) => {
        const domain = c.domain.replace(/^\./, "");
        return (
          (hostname === domain || hostname.endsWith(`.${domain}`)) &&
          (c.expires === -1 || c.expires > Date.now() / 1000)
        );
      }),
      origins: state.origins.filter((o) => o.origin === origin),
    }),
    "{}",
  );
}
export async function startProfileCapture(
  owner: string,
  input: Record<string, unknown>,
  projectId: number,
  automation?: { credentials: (id: string) => string },
) {
  await profileProject(owner, projectId);
  const details = captureDetails(input);
  profileKey(); // Fail before allocating a paid browser if encryption is unavailable.
  await ensureSchema();
  const sql = getSql();
  // Provider TTL releases abandoned browsers; reclaim only expired grants.
  await sql`UPDATE profile_captures SET status='expired',automation_credentials=NULL WHERE owner_github_id=${owner} AND expires_at <= NOW() AND status IN ('active','saving')`;
  const id = randomUUID();
  const reserved =
    await sql`INSERT INTO profile_captures (id,owner_github_id,name,origin,verification_path,verification_text,project_id,automation_status,automation_message,automation_credentials)
    VALUES (${id},${owner},${details.name},${details.origin},${details.path},${details.text},${projectId},${automation ? "queued" : null},${automation ? "Preparing a private browser…" : null},${automation ? automation.credentials(id) : null}) ON CONFLICT DO NOTHING RETURNING id,expires_at`;
  if (!Array.isArray(reserved) || !reserved.length)
    throw new ProfileError(
      "A sign-in browser is already open. Finish or cancel it first; abandoned sessions expire after 10 minutes.",
    );
  let sessionId: string | null = null;
  try {
    const session = await createBrowserSession(true, true);
    sessionId = session.id;
    await sql`UPDATE profile_captures SET session_id=${session.id} WHERE id=${id} AND owner_github_id=${owner} AND project_id=${projectId}`;
    const browser = await chromium.connectOverCDP(session.connectUrl, {
      timeout: 15_000,
    });
    try {
      const context = browser.contexts()[0];
      if (!context) throw new Error("No browser context");
      const page = context.pages()[0] || (await context.newPage());
      // A protected URL lets the app choose its own sign-in/provider redirect.
      await page.goto(new URL(details.path, details.origin).href, {
        waitUntil: "domcontentloaded",
        timeout: 25_000,
      });
    } finally {
      await browser.close();
    } // keepAlive retains the interactive session.
    const liveUrl = await browserLiveUrl(session.id);
    return {
      id,
      liveUrl,
      expiresAt: new Date(
        (reserved[0] as { expires_at: string }).expires_at,
      ).getTime(),
    };
  } catch {
    if (sessionId) await closeBrowserSession(sessionId).catch(() => {});
    await sql`UPDATE profile_captures SET status='error',automation_credentials=NULL WHERE id=${id} AND owner_github_id=${owner} AND project_id=${projectId}`;
    throw new ProfileError(
      "Could not open the sign-in browser. Check Browserbase configuration and interactive-session support, then try again.",
    );
  }
}
export async function finishProfileCapture(
  owner: string,
  id: string,
  projectId: number,
  cancel = false,
  automationToken?: string,
) {
  await profileProject(owner, projectId);
  if (!/^[0-9a-f-]{36}$/i.test(id))
    throw new ProfileError("Choose a valid sign-in session.");
  await ensureSchema();
  const sql = getSql();
  const rows =
    await sql`UPDATE profile_captures SET status=${cancel ? "cancelled" : "saving"}, automation_credentials=CASE WHEN ${cancel} THEN NULL ELSE automation_credentials END WHERE id=${id} AND owner_github_id=${owner} AND project_id=${projectId} AND status='active' AND expires_at > NOW() AND (${cancel} OR automation_status IS NULL OR automation_token=${automationToken || null}::uuid) RETURNING *`;
  const capture = Array.isArray(rows)
    ? (rows[0] as CaptureRow | undefined)
    : null;
  if (!capture)
    throw new ProfileError(
      "This sign-in session is unavailable or expired. Start a new one.",
    );
  if (cancel) {
    if (capture.session_id)
      await closeBrowserSession(capture.session_id).catch(() => {});
    return null;
  }
  let saved = false;
  try {
    const browser = await chromium.connectOverCDP(
      browserConnectUrl(capture.session_id),
      { timeout: 15_000 },
    );
    try {
      const context = browser.contexts()[0];
      if (!context) throw new Error("Browser unavailable");
      const state = scopedCaptureState(
        capture.origin,
        await context.storageState(),
      );
      // Verify a replayed session, not the still-signed-in source tab.
      const page = await authenticatedPage(browser, {
        origin: capture.origin,
        state,
        encrypted_state: "",
        verification_path: capture.verification_path,
        verification_text: capture.verification_text,
      });
      await page.context().close();
      const encrypted = encryptProfile(state, owner, capture.origin);
      // Save and consume the grant atomically; never return captured credentials.
      const profiles = await sql`WITH capture_grant AS (
        UPDATE profile_captures SET status='completed',automation_credentials=NULL WHERE id=${id} AND owner_github_id=${owner} AND project_id=${projectId} AND status='saving' AND expires_at > NOW() RETURNING *
      ), profile AS (
        INSERT INTO auth_profiles(owner_github_id,name,origin,encrypted_state,verification_path,verification_text,project_id,source_capture_id)
        SELECT owner_github_id,name,origin,${encrypted},verification_path,verification_text,project_id,id FROM capture_grant
        RETURNING id,name,origin,verification_path,verification_text,created_at
      ) SELECT * FROM profile`;
      if (!Array.isArray(profiles) || !profiles.length)
        throw new Error("Session expired");
      saved = true;
      return profiles[0];
    } finally {
      await browser.close().catch(() => {});
    }
  } catch {
    throw new ProfileError(
      "Sign-in could not be verified. Finish signing in, check that the protected page shows your signed-in text, then try saving again. Nothing was saved.",
    );
  } finally {
    if (saved) await closeBrowserSession(capture.session_id).catch(() => {});
    else
      await sql`UPDATE profile_captures SET status='active' WHERE id=${id} AND owner_github_id=${owner} AND project_id=${projectId} AND status='saving'`;
  }
}

export async function activeProfileCapture(owner: string, projectId: number) {
  await profileProject(owner, projectId);
  await ensureSchema();
  const rows =
    await getSql()`SELECT id,session_id,expires_at FROM profile_captures WHERE owner_github_id=${owner} AND project_id=${projectId} AND automation_status IS NULL AND status='active' AND expires_at > NOW()`;
  const row = Array.isArray(rows) ? (rows[0] as CaptureRow | undefined) : null;
  if (!row?.session_id) return null;
  return {
    id: row.id,
    liveUrl: await browserLiveUrl(row.session_id),
    expiresAt: new Date(row.expires_at).getTime(),
  };
}
