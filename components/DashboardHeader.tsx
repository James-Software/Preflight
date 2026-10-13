import { signOut } from "@/auth";
import { PixelPlaneSprite } from "@/components/PixelPlane";

export default function DashboardHeader({
  user,
}: {
  user: { name?: string | null; image?: string | null };
}) {
  return (
    <header className="border-b border-mist">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a
          href="/dashboard"
          className="flex items-center gap-2.5"
          aria-label="PreFlight home"
        >
          <PixelPlaneSprite width={28} />
          <span className="font-display text-lg font-bold tracking-tight text-ink">
            PreFlight
          </span>
        </a>
        <div className="flex items-center gap-3">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.image}
              alt={user.name ?? ""}
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
  );
}
