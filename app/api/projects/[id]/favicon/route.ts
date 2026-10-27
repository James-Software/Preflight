import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getProject } from "@/lib/schema";
import { appIconOrigin, isPreflightOrigin } from "@/lib/site-icons";
import { discoverSiteIcons } from "@/lib/discover-site-icons";
export const runtime = "nodejs";
export const maxDuration = 10;
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const owner = (await auth())?.user?.githubId;
  if (!owner)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0)
    return NextResponse.json({ error: "Project unavailable" }, { status: 404 });
  const project = await getProject(id, owner, "member");
  if (!project)
    return NextResponse.json({ error: "Project unavailable" }, { status: 404 });
  const origin = appIconOrigin(
    project.app_url || project.latest_target_url || null,
  );
  const icons = project.image_url
    ? [project.image_url]
    : !origin
      ? []
      : isPreflightOrigin(origin)
        ? ["/icon.png"]
        : await discoverSiteIcons(origin);
  return NextResponse.json(
    { icons },
    { headers: { "Cache-Control": "no-store" } },
  );
}
