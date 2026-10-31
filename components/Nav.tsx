"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Brand from "./Brand";
import ProfileMenu from "./ProfileMenu";
import ThemeToggle from "./ThemeToggle";
import type { ProfileUser } from "./Avatar";

const SCROLL_AFTER = 8;

export default function Nav({
  user: initialUser,
  isAdmin: initialAdmin = false,
  loadSession = false,
}: {
  user: ProfileUser | null;
  isAdmin?: boolean;
  loadSession?: boolean;
}) {
  const [user, setUser] = useState(initialUser);
  const [isAdmin, setIsAdmin] = useState(initialAdmin);
  const [isGuest, setIsGuest] = useState(false);
  useEffect(() => {
    if (!loadSession) return;
    const controller = new AbortController();
    void fetch("/api/navigation-session", { cache: "no-store", credentials: "same-origin", signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(session => { if (!controller.signal.aborted && session) { setUser(session.user); setIsAdmin(session.isAdmin === true); setIsGuest(session.isGuest === true); } })
      .catch(() => {});
    return () => controller.abort();
  }, [loadSession]);
  const landing = usePathname() === "/";
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let raf = 0;
    let pollRaf = 0;
    const sync = () => setScrolled(window.scrollY > SCROLL_AFTER);
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(sync);
    };
    // Scroll restoration can land after hydration without a scroll event.
    const start = performance.now();
    const poll = () => {
      sync();
      const elapsed = performance.now() - start;
      if (
        (elapsed <= 3000 || document.readyState !== "complete") &&
        elapsed <= 10000
      ) {
        pollRaf = requestAnimationFrame(poll);
      }
    };
    sync();
    pollRaf = requestAnimationFrame(poll);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("load", sync);
    window.addEventListener("pageshow", sync);
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(pollRaf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("load", sync);
      window.removeEventListener("pageshow", sync);
    };
  }, []);

  const glass = scrolled || !landing;

  return (
    <nav
      aria-label="Main navigation"
      className="site-nav fixed inset-x-0 top-0 z-50"
      data-scrolled={scrolled}
      data-glass={glass}
    >
      <div className="site-nav-frame relative mx-auto mt-3">
        <div
          aria-hidden="true"
          className="site-nav-glass pointer-events-none absolute inset-0"
        />
        <div className="relative flex min-h-16 items-center justify-between gap-3 px-3 sm:px-5 md:min-h-[68px]">
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
                <ProfileMenu user={user} isAdmin={isAdmin} isGuest={isGuest} />
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
      </div>
    </nav>
  );
}
