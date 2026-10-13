import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { createProject } from "@/lib/schema";
import DashboardHeader from "@/components/DashboardHeader";
import RepoPicker from "@/components/RepoPicker";

const ERRORS: Record<string, string> = {
  "bad-url": "Enter a valid app URL starting with http:// or https://.",
  "bad-repo": "Pick a repository from the list or paste a valid github.com link.",
  "unowned-repo": "You can only connect repositories you own.",
  "no-repo": "Pick a repository first.",
};

async function create(formData: FormData) {
  "use server";
  const session = await auth();
  const githubId = session?.user?.githubId;
  const githubLogin = session?.user?.githubLogin?.toLowerCase();
  if (!githubId) redirect("/login");

  const appUrl = String(formData.get("appUrl") ?? "").trim();
  const repoFullName = String(formData.get("repo") ?? "").trim();

  let url: URL;
  try {
    url = new URL(appUrl);
  } catch {
    redirect("/dashboard/projects/new?error=bad-url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    redirect("/dashboard/projects/new?error=bad-url");
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

  const project = await createProject(githubId, url.toString(), repoFullName);
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
    <main className="min-h-screen bg-white">
      <DashboardHeader user={session.user} />
      <div className="mx-auto max-w-xl px-6 py-14">
        <a
          href="/dashboard"
          className="text-sm font-medium text-ink/60 transition-colors duration-150 hover:text-ink"
        >
          &larr; All projects
        </a>
        <h1 className="font-display mt-4 text-3xl font-bold tracking-tight text-ink">
          New project
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink/60">
          Point PreFlight at a deployed app and its GitHub repository. The
          swarm will test the app like real users.
        </p>

        <form action={create} className="mt-8 space-y-5">
          <div>
            <label
              htmlFor="appUrl"
              className="mb-1.5 block text-sm font-medium text-ink"
            >
              App URL
            </label>
            <input
              id="appUrl"
              name="appUrl"
              type="url"
              required
              placeholder="https://myapp.com"
              className="w-full rounded-xl border border-mist bg-white px-4 py-3 text-sm text-ink placeholder:text-ink/40 focus:border-ink/30 focus:outline-none"
            />
          </div>
          <RepoPicker name="repo" />

          {error && ERRORS[error] ? (
            <p className="text-sm font-medium text-red-600">{ERRORS[error]}</p>
          ) : null}

          <button
            type="submit"
            className="pressable btn-gradient cursor-pointer rounded-full px-6 py-3 text-sm font-medium text-white"
          >
            Create project
          </button>
        </form>
      </div>
    </main>
  );
}
