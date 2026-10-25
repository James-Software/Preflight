import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getProject } from "@/lib/schema";
import {
  listProjectDatabases,
  projectDatabaseSettings,
  saveProjectDatabase,
  disconnectProjectDatabase,
} from "@/lib/database-connections";
import { DatabaseCheckError } from "@/lib/database-check-config";
import { ProfileError } from "@/lib/auth-profile-state";
export const maxDuration = 60;
async function caller(id: string) {
  const owner = (await auth())?.user?.githubId;
  if (!owner) return null;
  const projectId = Number(id);
  if (
    !Number.isSafeInteger(projectId) ||
    projectId <= 0 ||
    !(await getProject(projectId, owner))
  )
    return null;
  return { owner, projectId };
}
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await caller((await params).id);
  if (!user)
    return NextResponse.json(
      { error: "Project unavailable. Sign in to your own project." },
      { status: 404 },
    );
  try {
    const id = req.nextUrl.searchParams.get("connection");
    if (id) {
      const number = Number(id);
      if (!Number.isSafeInteger(number) || number <= 0)
        throw new DatabaseCheckError("Choose a valid connection.");
      return NextResponse.json({
        settings: await projectDatabaseSettings(
          user.projectId,
          user.owner,
          number,
        ),
      });
    }
    return NextResponse.json({
      connections: await listProjectDatabases(user.projectId, user.owner),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof DatabaseCheckError || error instanceof ProfileError
            ? error.message
            : "Could not load database settings.",
      },
      { status: 400 },
    );
  }
}
async function mutate(
  req: NextRequest,
  params: Promise<{ id: string }>,
  remove: boolean,
) {
  if (req.headers.get("origin") !== req.nextUrl.origin)
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const user = await caller((await params).id);
  if (!user)
    return NextResponse.json(
      { error: "Project unavailable. Sign in to your own project." },
      { status: 404 },
    );
  try {
    const raw = await req.text();
    if (raw.length > 100_000)
      throw new DatabaseCheckError(
        "Use at most 100 KB of database configuration.",
      );
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      throw new DatabaseCheckError("Use valid JSON for the database settings.");
    }
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new DatabaseCheckError("Complete the database settings.");
    if (
      input.id !== undefined &&
      (!Number.isSafeInteger(input.id) || input.id <= 0)
    )
      throw new DatabaseCheckError("Choose a valid connection.");
    if (remove) {
      if (
        !input.id ||
        !(await disconnectProjectDatabase(user.projectId, user.owner, input.id))
      )
        return NextResponse.json(
          { error: "Connection not found." },
          { status: 404 },
        );
      revalidatePath(`/dashboard/projects/${user.projectId}`);
      return NextResponse.json({ disconnected: true });
    }
    if (
      typeof input.origin !== "string" ||
      typeof input.connectionString !== "string" ||
      input.connectionString.length > 8192
    )
      throw new DatabaseCheckError(
        "Enter an app origin and a PostgreSQL connection URL.",
      );
    const connection = await saveProjectDatabase(
      user.projectId,
      user.owner,
      input,
    );
    revalidatePath(`/dashboard/projects/${user.projectId}`);
    return NextResponse.json({ connection });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof DatabaseCheckError || error instanceof ProfileError
            ? error.message
            : "Could not save database settings. Check the connection and try again.",
      },
      { status: 400 },
    );
  }
}
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return mutate(req, params, false);
}
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return mutate(req, params, true);
}
