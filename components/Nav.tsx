"use client";

import { useEffect, useState } from "react";

/** Minimal session user shape the nav needs. Resolved server-side. */
export type NavUser = {
  name?: string | null;
  image?: string | null;
};

/** px scrolled before the bar becomes the floating pill */
const SCROLL_AFTER = 72;

// James's motion spec: 100-300ms, cubic-bezier(0.16,1,0.3,1). Only the
// morphing properties transition — never transition-all. border-radius is
// intentionally NOT transitioned: the pill snaps to fully rounded the
// instant scrolling starts, so the glass lands on an already-rounded bar.
// Padding is constant across states (animating it caused layout jank).
// Written as full literal class strings so Tailwind's scanner picks them up.
const MORPH_TRANSITION =
  "transition-[max-width,width,margin-top,background-color,border-color,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]";

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
    const sync = () => {
      const s = window.scrollY > SCROLL_AFTER;
      if (s !== last) {
        last = s;
        setScrolled(s);
      }
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(sync);
    };
    // Browsers restore the scroll position asynchronously after load,
    // sometimes seconds later, without firing a scroll event. Poll briefly
    // after mount so a refreshed mid-page load gets the pill instead of
    // being stuck transparent. Cheap: one scrollY read per frame, stops
    // after 3s.
    const pollStart = performance.now();
    let pollRaf = 0;
    const poll = () => {
      sync();
      if (performance.now() - pollStart < 3000) {
        pollRaf = requestAnimationFrame(poll);
      }
    };
    pollRaf = requestAnimationFrame(poll);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(pollRaf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const t = reduced ? "" : MORPH_TRANSITION;

  // Top-of-page colors: white on dark hero, ink on light. The bar itself
  // stays transparent at the top; the glass pill only appears on scroll.
  // On dark, the pill is dark glass (a white pill reads as solid, not glass).
  // The pill narrows only slightly (like OpenWhispr) — it stays a bar, not
  // a tiny capsule. Liquid glass: inset top highlight catches the rim.
  const pillBar = dark
    ? "mt-3 w-[calc(100%-2.5rem)] max-w-[1060px] rounded-full border border-white/20 bg-[#0b0d16]/60 px-6 py-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur-xl"
    : "mt-3 w-[calc(100%-2.5rem)] max-w-[1060px] rounded-full border border-ink/10 bg-white/70 px-6 py-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.6),0_8px_30px_rgba(30,27,75,0.12)] backdrop-blur-xl";
  const topBar = scrolled
    ? pillBar
    : "w-full max-w-6xl rounded-none border border-transparent bg-transparent px-6 py-4 shadow-none";
  const topSolid = dark ? "text-white" : "text-ink";
  const topMuted = dark
    ? "text-white/70 hover:text-white"
    : scrolled
      ? "text-ink/70 hover:text-ink"
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
          {/* Crossfade: gradient plane at top, white plane once the pill appears */}
          <span className="relative block h-[30px] w-[106px]" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt=""
              className={`absolute inset-0 m-auto h-[30px] w-auto transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                scrolled ? "opacity-0" : "opacity-100"
              }`}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-white.png"
              alt=""
              className={`absolute inset-0 m-auto h-[30px] w-auto transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                scrolled ? "opacity-100" : "opacity-0"
              }`}
            />
          </span>
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
                  dark ? "hover:bg-white/10" : "hover:bg-ink/5"
                }`}
                aria-label="Open dashboard"
              >
                {user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.image}
                    alt=""
                    className={`h-8 w-8 rounded-full ring-1 ${
                      dark ? "ring-white/20" : "ring-ink/10"
                    }`}
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
