"use client";

import { useEffect, useRef, useState } from "react";

import ThemeToggle, { MoonIcon, SunIcon } from "./ThemeToggle";
import { applyTheme } from "./theme";

/** Minimal session user shape the nav needs. Resolved server-side. */
export type NavUser = {
  name?: string | null;
  image?: string | null;
};

/** Reads the real theme from <html class="dark">. Initialized from the DOM
    — the blocking theme script in layout.tsx runs before hydration, so the
    first render already matches (no flash). Kept in sync via
    MutationObserver so the toggle updates the nav instantly. */
function useDarkMode() {
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document === "undefined"
      ? true
      : document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const el = document.documentElement;
    setIsDark(el.classList.contains("dark"));
    const obs = new MutationObserver(() =>
      setIsDark(el.classList.contains("dark")),
    );
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

/** px scrolled before the glass bar appears — effectively
    immediate, with just enough buffer to ignore sub-pixel scroll noise */
const SCROLL_AFTER = 8;

// James's motion spec: 100-300ms, cubic-bezier(0.16,1,0.3,1). Never
// transition-all. The bar is two layers:
// - Outer: morphs width only (subtle 6xl -> 1060px, like OpenWhispr).
// - Glass background: ALWAYS rounded with blur applied — a rounded-2xl
//   bar at every breakpoint. It only fades in via opacity.
//   Nothing ever toggles backdrop-filter or border-radius at a given
//   breakpoint, so there's no instant pop that can flash as a rectangle.
// Padding and margin-top are constant across scroll states, so the vertical
// center of the elements never shifts. Written as full literal class strings
// so Tailwind's scanner picks them up.
const WIDTH_TRANSITION =
  "transition-[max-width,width] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]";
const GLASS_FADE =
  "transition-opacity duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]";

// Soft white halo behind nav content while the bar is transparent (top of
// page), so dark text stays readable over light artwork. Only active in
// the transparent state on light backgrounds — the glass bar carries its
// own background, and dark mode needs no halo.
const GLOW_TEXT =
  "[text-shadow:0_0_14px_rgba(255,255,255,0.95),0_0_34px_rgba(255,255,255,0.85)]";
const GLOW_SPRITE = "[filter:drop-shadow(0_0_7px_rgba(255,255,255,0.95))]";

// Liquid glass: saturated blur, translucent fill, and inset edge highlights
// so light catches the rounded rim like real glass. The theme dimension is
// CSS-driven (dark: variants), never JS state — the blocking theme script
// sets <html class="dark"> before first paint, so a fresh light-mode load
// can never flash the dark glass before hydration. (A white pill would read
// as solid, not glass, hence the dark tint in dark mode.)
const GLASS =
  "border border-ink/10 bg-white/70 shadow-[inset_0_1px_1px_rgba(255,255,255,0.6),0_8px_30px_rgba(30,27,75,0.12)] backdrop-blur-xl dark:border-white/20 dark:bg-[#0b0d16]/60 dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_8px_30px_rgba(0,0,0,0.45)]";

export default function Nav({ user }: { user: NavUser | null }) {
  const dark = useDarkMode();
  // Match the server render during hydration, then read the restored position
  // in the effect so React applies the glass styles as a real state update.
  const [scrolled, setScrolled] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Dismiss the profile menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    let raf = 0;
    const sync = () => {
      setScrolled(window.scrollY > SCROLL_AFTER);
    };
    sync();
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(sync);
    };
    // Browsers restore the scroll position asynchronously after load,
    // sometimes seconds later (slower on mobile), without firing a scroll
    // event. Poll after mount so a refreshed mid-page load gets the bar
    // instead of being stuck transparent. Cheap: one scrollY read per
    // frame. Re-check on load/pageshow too, for restores that land after
    // the first paint burst (or come from the bfcache).
    const pollStart = performance.now();
    let pollRaf = 0;
    const poll = () => {
      sync();
      const elapsed = performance.now() - pollStart;
      const settled =
        (elapsed > 3000 && document.readyState === "complete") ||
        elapsed > 10000;
      if (!settled) {
        pollRaf = requestAnimationFrame(poll);
      }
    };
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

  const wt = reduced ? "" : WIDTH_TRANSITION;
  const ft = reduced ? "" : GLASS_FADE;

  // The bar narrows only slightly on scroll (like OpenWhispr) — it stays a
  // bar, not a tiny capsule. Mobile gets tighter margins; desktop keeps the
  // subtle width morph.
  const barWidth = scrolled
    ? "w-[calc(100%-1.5rem)] md:w-[calc(100%-2.5rem)] max-w-[1060px]"
    : "w-[calc(100%-1.5rem)] md:w-full md:max-w-6xl";

  // Top-of-page colors are CSS-driven (dark: variants), not JS state: the
  // blocking theme script sets the class before first paint, so the server
  // render can never flash the wrong text color in light mode. Only the
  // scrolled dimension needs JS.
  const topSolid = "text-ink dark:text-white";
  const topMuted = scrolled
    ? "text-ink/70 hover:text-ink dark:text-white/70 dark:hover:text-white"
    : "text-ink/60 hover:text-ink dark:text-white/70 dark:hover:text-white";
  const glow = scrolled ? "" : `${GLOW_TEXT} dark:[text-shadow:none]`;
  const spriteGlow = scrolled ? "" : `${GLOW_SPRITE} dark:[filter:none]`;

  return (
    <nav className="fixed inset-x-0 top-0 z-50" suppressHydrationWarning>
      <div className={`relative mx-auto mt-3 ${wt} ${barWidth}`}>
        {/* Glass background — rounded bar at every breakpoint.
            Always rounded, only fades in. Never flashes. */}
        <div
          aria-hidden="true"
          className={`absolute inset-0 rounded-2xl ${GLASS} ${ft} ${scrolled ? "opacity-100" : "opacity-0"}`}
        />
        {/* Content — stable layout, never moves */}
        <div className="relative flex w-full items-center justify-between px-4 py-3 md:px-6 md:py-4">
          <a
            href="#top"
            className={`flex items-center gap-2.5 ${spriteGlow}`}
            aria-label="PreFlight home"
          >
            {/* Crossfade: gradient plane at top, white plane once the dark glass
                bar appears. In light mode the bar is light glass, so the
                gradient plane stays (a white plane would vanish). */}
            <span
              className="relative block h-[26px] w-[92px] md:h-[30px] md:w-[106px]"
              aria-hidden="true"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt=""
                className={`absolute inset-0 m-auto h-[26px] w-auto transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] md:h-[30px] ${
                  scrolled && dark ? "opacity-0" : "opacity-100"
                }`}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo-white.png"
                alt=""
                className={`absolute inset-0 m-auto h-[26px] w-auto transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] md:h-[30px] ${
                  scrolled && dark ? "opacity-100" : "opacity-0"
                }`}
              />
            </span>
            <span
              className={`hidden font-display text-lg font-bold tracking-tight min-[420px]:inline ${topSolid} ${glow}`}
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
                  className={`pressable whitespace-nowrap rounded-full px-3 py-2 text-xs font-medium transition-colors duration-150 md:px-4 md:py-2.5 md:text-sm ${topMuted} ${glow}`}
                >
                  Dashboard
                </a>
                <div ref={menuRef} className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setMenuOpen((o) => !o)}
                    aria-expanded={menuOpen}
                    aria-haspopup="menu"
                    aria-label="Profile menu"
                    className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 transition-colors duration-150 hover:bg-ink/5 dark:hover:bg-white/10`}
                  >
                    {user.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={user.image}
                        alt=""
                        className="h-8 w-8 rounded-full ring-1 ring-ink/10 dark:ring-white/20"
                      />
                    ) : null}
                    <span
                      className={`whitespace-nowrap text-xs font-medium md:text-sm ${topSolid} ${glow}`}
                    >
                      {user.name?.split(" ")[0] ?? "Profile"}
                    </span>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className={`h-3.5 w-3.5 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${topMuted} ${
                        menuOpen ? "rotate-180" : ""
                      }`}
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  {menuOpen ? (
                    <div
                      role="menu"
                      aria-label="Profile"
                      className="absolute right-0 top-[calc(100%+10px)] w-60 rounded-2xl border border-ink/10 bg-white/90 p-2 shadow-[0_8px_30px_rgba(30,27,75,0.14)] backdrop-blur-xl dark:border-white/20 dark:bg-[#0b0d16]/90 dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
                    >
                      <p className="px-3 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/50 dark:text-white/50">
                        Appearance
                      </p>
                      <div
                        role="group"
                        aria-label="Color theme"
                        className="grid grid-cols-2 gap-1 rounded-xl bg-ink/5 p-1 dark:bg-white/10"
                      >
                        {(["light", "dark"] as const).map((t) => {
                          const selected = dark === (t === "dark");
                          return (
                            <button
                              key={t}
                              type="button"
                              role="menuitemradio"
                              aria-checked={selected}
                              onClick={() => {
                                applyTheme(t);
                                setMenuOpen(false);
                              }}
                              className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium capitalize transition-colors duration-150 ${
                                selected
                                  ? "bg-white text-ink shadow-sm dark:bg-white/15 dark:text-white"
                                  : "text-ink/60 hover:text-ink dark:text-white/60 dark:hover:text-white"
                              }`}
                            >
                              {t === "dark" ? (
                                <MoonIcon className="h-3.5 w-3.5" />
                              ) : (
                                <SunIcon className="h-3.5 w-3.5" />
                              )}
                              {t}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <ThemeToggle />
                <a
                  href="/login"
                  className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-medium transition-colors duration-150 md:px-4 md:py-2.5 md:text-sm ${topMuted} ${glow}`}
                >
                  Log in
                </a>
                <a
                  href="#early-access"
                  className="pressable btn-gradient whitespace-nowrap rounded-full px-3 py-2 text-xs font-medium text-white md:px-4 md:py-2.5 md:text-sm"
                >
                  Get early access
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
