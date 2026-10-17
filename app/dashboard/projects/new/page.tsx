import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { createProject } from "@/lib/schema";
import DashboardHeader from "@/components/DashboardHeader";
import NewProjectForm from "@/components/NewProjectForm";

async function create(formData: FormData) {
  "use server";
  const session = await auth();
  const githubId = session?.user?.githubId;
  const githubLogin = session?.user?.githubLogin?.toLowerCase();
  if (!githubId) redirect("/login");

  const appUrl = String(formData.get("appUrl") ?? "").trim();
  const repoFullName = String(formData.get("repo") ?? "").trim();

  // App URL is optional: empty means runs target the default branch's
  // latest preview deployment, resolved when the run starts.
  let appUrlOrNull: string | null = null;
  if (appUrl) {
    let url: URL;
    try {
      url = new URL(appUrl);
    } catch {
      redirect("/dashboard/projects/new?error=bad-url");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      redirect("/dashboard/projects/new?error=bad-url");
    }
    appUrlOrNull = url.toString();
  }
  if (!repoFullName) {
    redirect("/dashboard/projects/new?error=no-repo");
  }
  const repoMatch = repoFullName.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (!repoMatch) {
    redirect("/dashboard/projects/new?error=bad-repo");
  }
  // Ownership is the security boundary, re-enforced server-side: the repo's
  // owner segment must be the caller's GitHub login. (The picker verified
  // existence and access moments before submit.)
  if (!githubLogin || repoMatch[1].toLowerCase() !== githubLogin) {
    redirect("/dashboard/projects/new?error=unowned-repo");
  }

  const project = await createProject(githubId, appUrlOrNull, repoFullName);
  redirect(`/dashboard/projects/${project.id}`);
}

export default async function NewProject({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { error } = await searchParams;

  return (
    <main className="min-h-screen bg-white dark:bg-[#05060a]">
      <DashboardHeader user={session.user} />
      <div className="mx-auto max-w-xl px-6 py-14">
        <a
          href="/dashboard"
          className="text-sm font-medium text-ink/60 transition-colors duration-150 hover:text-ink dark:text-white/60 dark:hover:text-white"
        >
          &larr; All projects
        </a>
        <h1 className="font-display mt-4 text-3xl font-bold tracking-tight text-ink dark:text-white">
          New project
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink/60 dark:text-white/60">
          Point PreFlight at a deployed app and its GitHub repository. The
          swarm will test the app like real users.
        </p>

        <NewProjectForm action={create} error={error} />
      </div>
    </main>
  );
}
