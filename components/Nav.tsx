"use client";

import { useEffect, useState } from "react";

/** Minimal session user shape the nav needs. Resolved server-side. */
export type NavUser = {
  name?: string | null;
  image?: string | null;
};

/** px scrolled before the bar morphs into a floating pill */
const SCROLL_AFTER = 32;

// James's motion spec: 100-300ms, cubic-bezier(0.16,1,0.3,1). Only the
// morphing properties transition — never transition-all. Written as full
// literal class strings so Tailwind's scanner picks them up.
const MORPH_TRANSITION =
  "transition-[width,max-width,margin-top,padding,border-radius,border-color,box-shadow,background-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]";

// Soft white halo behind nav content while the bar is transparent (top of
// page), so dark text stays readable over light artwork. Only active in
// the non-pill state on light backgrounds — the pill carries its own
// white background, and dark mode needs no halo.
const GLOW_TEXT =
  "[text-shadow:0_0_14px_rgba(255,255,255,0.95),0_0_34px_rgba(255,255,255,0.85)]";
const GLOW_SPRITE = "[filter:drop-shadow(0_0_7px_rgba(255,255,255,0.95))]";

export default function Nav({
  user,
  dark = false,
}: {
  user: NavUser | null;
  dark?: boolean;
}) {
  const [scrolled, setScrolled] = useState(
    () => typeof window !== "undefined" && window.scrollY > SCROLL_AFTER,
  );
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    let raf = 0;
    let last = window.scrollY > SCROLL_AFTER;
    setScrolled(last);
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const s = window.scrollY > SCROLL_AFTER;
        if (s !== last) {
          last = s;
          setScrolled(s);
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const t = reduced ? "" : MORPH_TRANSITION;

  // Top-of-page colors: white on dark hero, ink on light. The scrolled
  // pill is always the same white treatment. Unscrolled on dark, the bar
  // is frosted glass over the page.
  const topBar = scrolled
    ? "mt-3 w-[calc(100%-2rem)] max-w-[36rem] rounded-full border border-ink/10 bg-white/90 px-5 py-2.5 shadow-[0_8px_30px_rgba(30,27,75,0.12)] backdrop-blur-md"
    : dark
      ? "w-full rounded-none border-b border-white/10 bg-[#05060a]/60 px-6 py-4 shadow-none backdrop-blur-xl"
      : "w-full max-w-6xl rounded-none border border-transparent bg-transparent px-6 py-5 shadow-none";
  const topSolid = scrolled ? "text-ink" : dark ? "text-white" : "text-ink";
  const topMuted = scrolled
    ? "text-ink/70 hover:text-ink"
    : dark
      ? "text-white/70 hover:text-white"
      : "text-ink/60 hover:text-ink";
  const glow = scrolled || dark ? "" : GLOW_TEXT;
  const spriteGlow = scrolled || dark ? "" : GLOW_SPRITE;

  return (
    <nav className="fixed inset-x-0 top-0 z-50">
      <div className={`mx-auto flex items-center justify-between ${t} ${topBar}`}>
        <a
          href="#top"
          className={`flex items-center gap-2.5 ${spriteGlow}`}
          aria-label="PreFlight home"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="PreFlight logo"
            height={30}
            className="h-[30px] w-auto"
          />
          <span
            className={`font-display text-lg font-bold tracking-tight ${topSolid} ${glow}`}
          >
            PreFlight
          </span>
        </a>
        <div className="hidden items-center gap-8 md:flex">
          <a
            href="#how-it-works"
            className={`text-sm font-medium transition-colors duration-150 ${topMuted} ${glow}`}
          >
            How it works
          </a>
        </div>
        <div className="flex items-center gap-1.5">
          {user ? (
            <>
              <a
                href="/dashboard"
                className={`pressable rounded-full px-4 py-2.5 text-sm font-medium transition-colors duration-150 ${topMuted} ${glow}`}
              >
                Dashboard
              </a>
              <a
                href="/dashboard"
                className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors duration-150 ${
                  scrolled
                    ? "hover:bg-ink/5"
                    : dark
                      ? "hover:bg-white/10"
                      : "hover:bg-ink/5"
                }`}
                aria-label="Open dashboard"
              >
                {user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.image}
                    alt=""
                    className="h-8 w-8 rounded-full ring-1 ring-ink/10"
                  />
                ) : null}
                <span className={`text-sm font-medium ${topSolid} ${glow}`}>
                  {user.name?.split(" ")[0] ?? "Dashboard"}
                </span>
              </a>
            </>
          ) : (
            <>
              <a
                href="/login"
                className={`rounded-full px-4 py-2.5 text-sm font-medium transition-colors duration-150 ${topMuted} ${glow}`}
              >
                Log in
              </a>
              <a
                href="#early-access"
                className="pressable btn-gradient rounded-full px-4 py-2.5 text-sm font-medium text-white"
              >
                Get early access
              </a>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
