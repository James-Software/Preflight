import Brand from "./Brand";
import ProfileMenu from "./ProfileMenu";
import ThemeToggle from "./ThemeToggle";
import type { ProfileUser } from "./Avatar";

export default function Nav({
  user,
  isAdmin = false,
}: {
  user: ProfileUser | null;
  isAdmin?: boolean;
}) {
  return (
    <nav
      aria-label="Main navigation"
      className="site-nav fixed inset-x-0 top-0 z-50 bg-page"
    >
      <div className="mx-auto flex min-h-20 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Brand href="/" />
        <div className="flex shrink-0 items-center gap-1 sm:gap-3 md:gap-6">
          <a
            href="/#how-it-works"
            className="hidden min-h-11 items-center text-sm text-muted hover:text-ink md:inline-flex dark:hover:text-white"
          >
            How it works
          </a>
          <a
            href="/blog"
            className="hidden min-h-11 items-center text-sm text-muted hover:text-ink sm:inline-flex dark:hover:text-white"
          >
            Blog
          </a>
          {user ? (
            <>
              <a
                href="/dashboard"
                className="inline-flex min-h-11 items-center px-2 text-sm font-medium hover:text-primary"
              >
                Dashboard
              </a>
              <ProfileMenu user={user} isAdmin={isAdmin} />
            </>
          ) : (
            <>
              <ThemeToggle />
              <a
                href="/login"
                className="inline-flex min-h-11 items-center whitespace-nowrap px-2 text-sm text-muted hover:text-ink dark:hover:text-white"
              >
                Log in
              </a>
              <a
                href="/#early-access"
                className="pressable btn-primary inline-flex min-h-10 items-center whitespace-nowrap px-3 text-xs font-medium text-white sm:px-4 sm:text-sm"
              >
                <span className="min-[380px]:hidden">Early access</span>
                <span className="hidden min-[380px]:inline">
                  Get early access
                </span>
              </a>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
