import { auth } from "@/auth";
import { getTriggerClientConfig } from "@/lib/trigger-client";
import { getSql } from "@/lib/db";
import { isAdminLogin } from "@/lib/access";
import { NextResponse } from "next/server";

type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
  latencyMs: number;
};

async function check(
  name: string,
  fn: () => Promise<string>
): Promise<CheckResult> {
  const start = Date.now();
  try {
    const detail = await fn();
    return { name, ok: true, detail, latencyMs: Date.now() - start };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { name, ok: false, detail, latencyMs: Date.now() - start };
  }
}

/**
 * GET /api/health/keys — verifies every integration key in the Vercel
 * environment against its live API. Admin only; never returns key values,
 * only pass/fail.
 */
export async function GET() {
  const session = await auth();
  if (!isAdminLogin(session?.user?.githubLogin)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const checks: CheckResult[] = [];

  checks.push(
    await check("Neon (DATABASE_URL)", async () => {
      if (!process.env.DATABASE_URL) throw new Error("not set");
      const rows = await getSql()`SELECT 1 AS ok`;
      if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error("query returned no rows");
      }
      return "SELECT 1 succeeded";
    })
  );

  checks.push(
    await check("OpenRouter (OPENROUTER_API_KEY)", async () => {
      const key = process.env.OPENROUTER_API_KEY;
      if (!key) throw new Error("not set");
      const res = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
      }
      const data = (await res.json()) as { data?: unknown[] };
      return `authenticated, ${Array.isArray(data.data) ? data.data.length : 0} models listed`;
    })
  );

  checks.push(
    await check("Browserbase (BROWSERBASE_API_KEY)", async () => {
      const key = process.env.BROWSERBASE_API_KEY;
      if (!key) throw new Error("not set");
      const res = await fetch("https://api.browserbase.com/v1/sessions", {
        headers: { "x-bb-api-key": key },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
      }
      return "authenticated";
    })
  );

  checks.push(
    await check("GitHub App (AUTH_GITHUB_ID / AUTH_GITHUB_SECRET)", async () => {
      if (!process.env.AUTH_GITHUB_ID) throw new Error("AUTH_GITHUB_ID not set");
      if (!process.env.AUTH_GITHUB_SECRET) {
        throw new Error("AUTH_GITHUB_SECRET not set");
      }
      return "both set (the login flow itself is the live test)";
    })
  );

  checks.push(
    await check("Trigger.dev (TRIGGER_SECRET_KEY)", async () => {
      const config = getTriggerClientConfig();
      return config.previewBranch
        ? "Key and worker branch configured. Confirm this branch is deployed in Trigger.dev; this check does not start a task."
        : "Key configured for an unbranched worker environment. Confirm its tasks are deployed in Trigger.dev; this check does not start a task.";
    })
  );

  checks.push(
    await check("Auth config (AUTH_SECRET / AUTH_URL)", async () => {
      if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET not set");
      if (!process.env.AUTH_URL) throw new Error("AUTH_URL not set");
      return `AUTH_URL=${process.env.AUTH_URL}`;
    })
  );

  return NextResponse.json({
    ok: checks.every((c) => c.ok),
    checks,
  });
}
