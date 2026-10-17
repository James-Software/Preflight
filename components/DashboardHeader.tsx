import { signOut } from "@/auth";

export default function DashboardHeader({
  user,
}: {
  user: { name?: string | null; image?: string | null };
}) {
  return (
    <header className="border-b border-mist dark:border-white/10">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a
          href="/dashboard"
          className="flex items-center gap-2.5"
          aria-label="PreFlight home"
        >
          {/* New plane logo, theme-aware via pure CSS (server component):
              gradient mark on light, white mark on dark. */}
          <span className="relative block h-[28px] w-[100px]" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt=""
              className="absolute inset-0 h-[28px] w-auto dark:hidden"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-white.png"
              alt=""
              className="absolute inset-0 hidden h-[28px] w-auto dark:block"
            />
          </span>
          <span className="font-display text-lg font-bold tracking-tight text-ink dark:text-white">
            PreFlight
          </span>
        </a>
        <div className="flex items-center gap-3">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.image}
              alt={user.name ?? ""}
              className="h-8 w-8 rounded-full ring-1 ring-ink/10 dark:ring-white/10"
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
              className="cursor-pointer rounded-full px-4 py-2 text-sm font-medium text-ink/60 transition-colors duration-150 hover:text-ink dark:text-white/60 dark:hover:text-white"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
