import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getProject, setRunArchived } from "@/lib/schema";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> },
) {
  if (req.headers.get("origin") !== req.nextUrl.origin)
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const owner = (await auth())?.user?.githubId;
  if (!owner)
    return NextResponse.json(
      { error: "Sign in again to manage this run." },
      { status: 401 },
    );
  const { id, runId } = await params;
  const projectId = Number(id),
    runNumber = Number(runId);
  if (![projectId, runNumber].every((n) => Number.isSafeInteger(n) && n > 0))
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  const body = await req.json().catch(() => null);
  if (typeof body?.archived !== "boolean")
    return NextResponse.json(
      { error: "Choose archive or restore." },
      { status: 400 },
    );
  try {
    if (!(await getProject(projectId, owner, "member")))
      return NextResponse.json(
        { error: "Project not found." },
        { status: 404 },
      );
    if (!(await setRunArchived(runNumber, projectId, owner, body.archived)))
      return NextResponse.json(
        {
          error:
            "This run is unavailable or still active. Stop active runs before archiving.",
        },
        { status: 409 },
      );
    revalidatePath(`/dashboard/projects/${projectId}`);
    revalidatePath(`/dashboard/projects/${projectId}/runs/${runNumber}`);
    return NextResponse.json({ archived: body.archived });
  } catch {
    return NextResponse.json(
      { error: "Could not update this run. Try again." },
      { status: 500 },
    );
  }
}
