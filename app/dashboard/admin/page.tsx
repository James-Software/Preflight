import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  listWaitlist,
  approveLogin,
  isAdminLogin,
  ADMIN_LOGIN,
} from "@/lib/access";
import DashboardHeader from "@/components/DashboardHeader";

async function approve(formData: FormData) {
  "use server";
  const session = await auth();
  if (!isAdminLogin(session?.user?.githubLogin)) return;
  const login = String(formData.get("login") ?? "");
  await approveLogin(login);
  revalidatePath("/dashboard/admin");
}

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isAdminLogin(session.user.githubLogin)) redirect("/dashboard");

  const waitlist = await listWaitlist();

  return (
    <main className="min-h-screen bg-white">
      <DashboardHeader user={session.user} />
      <div className="mx-auto max-w-6xl px-6 py-14">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
          Waitlist
        </h1>
        <p className="mt-2 text-sm text-ink/60">
          {waitlist.length === 0
            ? "Nobody waiting."
            : `${waitlist.length} ${waitlist.length === 1 ? "person" : "people"} waiting.`}{" "}
          Approving signs them in on their next login.
        </p>

        {waitlist.length > 0 && (
          <ul className="mt-8 divide-y divide-mist rounded-2xl border border-mist">
            {waitlist.map((entry) => (
              <li
                key={entry.github_login}
                className="flex items-center gap-4 px-5 py-4"
              >
                {entry.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={entry.avatar_url}
                    alt=""
                    className="h-10 w-10 rounded-full ring-1 ring-ink/10"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-lavender" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {entry.name ?? entry.github_login}
                  </p>
                  <p className="truncate text-xs text-ink/50">
                    @{entry.github_login}
                  </p>
                </div>
                <form action={approve}>
                  <input type="hidden" name="login" value={entry.github_login} />
                  <button
                    type="submit"
                    className="pressable btn-gradient cursor-pointer rounded-full px-5 py-2 text-sm font-medium text-white"
                  >
                    Approve
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-8 text-xs text-ink/40">
          Admin: {ADMIN_LOGIN}. To add someone directly, run in Neon:{" "}
          <code className="rounded bg-lavender px-1.5 py-0.5">
            INSERT INTO allowed_github_users (github_login) VALUES
            (&apos;their-login&apos;)
          </code>
        </p>
      </div>
    </main>
  );
}
