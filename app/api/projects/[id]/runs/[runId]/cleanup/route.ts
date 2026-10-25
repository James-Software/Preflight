import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureSchema } from "@/lib/schema";
import {
  cleanupContext,
  listCleanup,
  decideCleanup,
} from "@/lib/database-cleanup";
import { DatabaseCheckError } from "@/lib/database-check-config";
import { ProfileError } from "@/lib/auth-profile-state";
export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ id: string; runId: string }> };
async function caller(context: Context) {
  const owner = (await auth())?.user?.githubId;
  if (!owner) throw new DatabaseCheckError("Sign in to review cleanup.");
  const params = await context.params,
    project = Number(params.id),
    run = Number(params.runId);
  if (![project, run].every((id) => Number.isSafeInteger(id) && id > 0))
    throw new DatabaseCheckError("Run unavailable.");
  await ensureSchema();
  const state = await cleanupContext(project, run, owner);
  return { run, ...state };
}
const headers = { "Cache-Control": "no-store" };
function failure(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof DatabaseCheckError || error instanceof ProfileError
          ? error.message
          : "Could not review database cleanup.",
    },
    { status: 400, headers },
  );
}
export async function GET(_req: NextRequest, context: Context) {
  try {
    const state = await caller(context);
    return NextResponse.json(
      { finished: state.finished, items: await listCleanup(state.run) },
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(req: NextRequest, context: Context) {
  if (req.headers.get("origin") !== req.nextUrl.origin)
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403, headers },
    );
  try {
    const state = await caller(context);
    if (!state.finished)
      throw new DatabaseCheckError(
        "Wait for the run to finish before reviewing cleanup.",
      );
    const raw = await req.text();
    if (raw.length > 1024)
      throw new DatabaseCheckError("Choose one cleanup action.");
    const input = JSON.parse(raw);
    if (
      !input ||
      typeof input.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        input.id,
      ) ||
      !["accept", "deny"].includes(input.decision)
    )
      throw new DatabaseCheckError(
        "Choose Accept or Deny for a cleanup action.",
      );
    await decideCleanup(state.run, input.id, input.decision);
    return NextResponse.json(
      { items: await listCleanup(state.run), finished: true },
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}
