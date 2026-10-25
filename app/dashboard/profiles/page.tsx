import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { listProjects, getProject } from "@/lib/schema";
export default async function ProfilesPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; origin?: string }>;
}) {
  const owner = (await auth())?.user?.githubId;
  if (!owner) redirect("/login?callbackUrl=%2Fdashboard%2Fprofiles");
  const query = await searchParams;
  const match =
    typeof query.returnTo === "string"
      ? /^\/dashboard\/projects\/(\d+)$/.exec(query.returnTo)
      : null;
  if (match && (await getProject(Number(match[1]), owner))) {
    const params = new URLSearchParams({ returnToRun: "1" });
    if (typeof query.origin === "string") params.set("origin", query.origin);
    redirect(`/dashboard/projects/${match[1]}/profiles?${params}`);
  }
  const projects = await listProjects(owner);
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">
        Choose a project
      </h1>
      <p className="mt-3 text-sm text-muted">
        Authentication profiles now live inside each project.
      </p>
      <ul className="mt-6 divide-y divide-line">
        {projects.map((project) => (
          <li key={project.id}>
            <Link
              className="pressable flex min-h-14 items-center justify-between gap-3 rounded-lg p-3 hover:bg-panel"
              href={`/dashboard/projects/${project.id}/profiles`}
            >
              <span className="break-all text-sm font-medium">
                {project.display_name || project.repo_full_name}
              </span>
              <span aria-hidden="true">→</span>
            </Link>
          </li>
        ))}
      </ul>
      {!projects.length && (
        <Link
          className="pressable btn-primary mt-6 inline-flex min-h-11 items-center px-5 text-sm"
          href="/dashboard/projects/new"
        >
          Create a project
        </Link>
      )}
    </main>
  );
}
