"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Brand from "./Brand";
import ProfileMenu from "./ProfileMenu";
import ThemeToggle from "./ThemeToggle";
import type { ProfileUser } from "./Avatar";

const SCROLL_AFTER = 8;

export default function Nav({
  user,
  isAdmin = false,
}: {
  user: ProfileUser | null;
  isAdmin?: boolean;
}) {
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
    <nav aria-label="Main navigation" className="fixed inset-x-0 top-0 z-50">
      <div className="relative mx-auto mt-3 w-[calc(100%-1.5rem)] max-w-6xl md:w-[calc(100%-2.5rem)]">
        <div
          aria-hidden="true"
          className={`absolute inset-0 rounded-2xl border border-line bg-surface/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.6),0_8px_30px_rgba(30,27,75,0.12)] backdrop-blur-xl transition-opacity duration-200 motion-reduce:transition-none dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_8px_30px_rgba(0,0,0,0.45)] ${glass ? "opacity-100" : "opacity-0"}`}
        />
        <div className="relative flex w-full items-center justify-between gap-2 px-3 py-3 sm:px-4 md:px-6 md:py-4">
          <Brand href="/" scrolled={glass} />
          <a
            href="/#how-it-works"
            className="hidden rounded-full px-3 py-2 text-sm font-medium text-ink/70 transition-colors hover:text-ink md:block dark:text-white/70 dark:hover:text-white"
          >
            How it works
          </a>
          <div className="flex shrink-0 items-center gap-1">
            {user ? (
              <>
                <a
                  href="/dashboard"
                  className="pressable rounded-full px-3 py-2 text-xs font-medium text-ink/70 transition-colors hover:text-ink md:text-sm dark:text-white/70 dark:hover:text-white"
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
                  className="whitespace-nowrap rounded-full px-2 py-2 text-xs font-medium text-ink/70 transition-colors hover:text-ink md:px-4 md:text-sm dark:text-white/70 dark:hover:text-white"
                >
                  Log in
                </a>
                <a
                  href="/#early-access"
                  className="pressable btn-gradient whitespace-nowrap rounded-full px-3 py-2 text-xs font-medium text-white md:px-4 md:py-2.5 md:text-sm"
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
