import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { createProject } from "@/lib/schema";
import NewProjectForm, {
  type ProjectFormState,
} from "@/components/NewProjectForm";

async function create(
  _previous: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  "use server";
  const session = await auth();
  const githubId = session?.user?.githubId;
  const githubLogin = session?.user?.githubLogin?.toLowerCase();
  if (!githubId) redirect("/login?callbackUrl=%2Fdashboard%2Fprojects%2Fnew");

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
      return {
        error: "Enter an app URL starting with http:// or https://.",
        field: "appUrl",
      };
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return {
        error: "Enter an app URL starting with http:// or https://.",
        field: "appUrl",
      };
    }
    appUrlOrNull = url.toString();
  }
  if (!repoFullName) {
    return { error: "Pick a repository first.", field: "repo" };
  }
  const repoMatch = repoFullName.match(
    /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/,
  );
  if (!repoMatch) {
    return {
      error: "Pick a repository or paste a valid GitHub link.",
      field: "repo",
    };
  }
  // Ownership is the security boundary, re-enforced server-side: the repo's
  // owner segment must be the caller's GitHub login. (The picker verified
  // existence and access moments before submit.)
  if (!githubLogin || repoMatch[1].toLowerCase() !== githubLogin) {
    return {
      error: "You can only connect repositories you own.",
      field: "repo",
    };
  }

  let project;
  try {
    project = await createProject(githubId, appUrlOrNull, repoFullName);
  } catch {
    return {
      error:
        "Could not create the project. Your selections are saved here; try again.",
    };
  }
  redirect(`/dashboard/projects/${project.id}`);
}

export default async function NewProject({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user)
    redirect("/login?callbackUrl=%2Fdashboard%2Fprojects%2Fnew");
  const { error } = await searchParams;

  return (
    <main className="min-h-[calc(100svh-5rem)] bg-page">
      <div className="mx-auto max-w-xl px-6 py-14">
        <a
          href="/dashboard"
          className="text-sm font-medium text-muted transition-colors duration-150 hover:text-ink dark:text-muted dark:hover:text-white"
        >
          &larr; All projects
        </a>
        <h1 className="font-sans mt-4 text-3xl font-semibold tracking-tight text-ink dark:text-white">
          New project
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted dark:text-muted">
          Point PreFlight at a deployed app and its GitHub repository. The swarm
          will test the app like real users.
        </p>

        <NewProjectForm action={create} error={error} />
      </div>
    </main>
  );
}
