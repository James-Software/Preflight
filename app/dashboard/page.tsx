import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import { PixelPlaneSprite } from "@/components/PixelPlane";

export default async function Dashboard() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user;

  return (
    <main className="min-h-screen bg-white">
      <header className="border-b border-mist">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a href="/" className="flex items-center gap-2.5" aria-label="Preflight home">
            <PixelPlaneSprite width={28} />
            <span className="font-display text-lg font-bold tracking-tight text-ink">
              Preflight
            </span>
          </a>
          <div className="flex items-center gap-3">
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.image}
                alt=""
                className="h-8 w-8 rounded-full ring-1 ring-ink/10"
              />
            ) : null}
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button
                type="submit"
                className="cursor-pointer rounded-full px-4 py-2 text-sm font-medium text-ink/60 transition-colors duration-150 hover:text-ink"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-14">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
          Welcome{user.name ? `, ${user.name.split(" ")[0]}` : ""}.
        </h1>
        <p className="mt-2 text-sm text-ink/60">{user.email}</p>

        <div className="mt-10 rounded-2xl border border-mist bg-lavender/50 px-8 py-14 text-center">
          <p className="font-display text-lg font-bold text-ink">
            No projects yet
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink/60">
            Connect an app URL and a GitHub repository to run your first
            swarm.
          </p>
          <p className="mt-4 text-xs text-ink/40">
            Project onboarding ships in the next milestone.
          </p>
        </div>
      </div>
    </main>
  );
}
