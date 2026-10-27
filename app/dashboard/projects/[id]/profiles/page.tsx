import { projectPage } from "@/lib/project-page";
import { listAuthProfiles, listUnassignedProfiles } from "@/lib/auth-profiles";
import ProfilesManager from "@/components/ProfilesManager";
export default async function ProjectProfilesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ origin?: string; returnToRun?: string }>;
}) {
  const { project, owner } = await projectPage((await params).id, "/profiles");
  if (project.owner_github_id !== owner) return <main className="py-2"><h1 className="text-3xl font-semibold">Profiles</h1><p className="mt-3 text-sm text-muted">The owner manages saved profiles. You can select a shared profile when starting a run.</p></main>;
  const query = await searchParams;
  const [profiles, unassigned] = await Promise.all([
    listAuthProfiles(owner, project.id),
    listUnassignedProfiles(owner),
  ]);
  let origin = "";
  try {
    origin = new URL(
      typeof query.origin === "string"
        ? query.origin
        : project.app_url || project.latest_target_url || "",
    ).origin;
  } catch {}
  return (
    <main className="py-2">
      <h1 className="text-3xl font-semibold tracking-tight">Profiles</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        Save a test account’s session for this project. Cookies and headers are
        used only for its matching app origin.
      </p>
      <ProfilesManager
        key={project.id}
        projectId={project.id}
        initialProfiles={profiles}
        unassignedProfiles={unassigned}
        initialOrigin={origin}
        returnTo={
          query.returnToRun === "1"
            ? `/dashboard/projects/${project.id}?configureRun=1`
            : null
        }
      />
    </main>
  );
}
