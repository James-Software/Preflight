"use client";

import { useEffect, useState } from "react";

/** Minimal session user shape the nav needs. Resolved server-side. */
export type NavUser = {
  name?: string | null;
  image?: string | null;
};

/** px scrolled before the bar swaps to the floating pill */
const SCROLL_AFTER = 32;

// James's motion spec: 100-300ms, cubic-bezier(0.16,1,0.3,1). Only opacity and
// transform animate — both run on the compositor, so the swap stays smooth
// even under heavy backdrop blur. Never transition-all. Written as full
// literal class strings so Tailwind's scanner picks them up.
const SWAP =
  "transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]";

// Soft white halo behind nav text while the bar is transparent (top of page),
// so dark text stays readable over light artwork.
const GLOW_TEXT =
  "[text-shadow:0_0_14px_rgba(255,255,255,0.95),0_0_34px_rgba(255,255,255,0.85)]";
const GLOW_SPRITE = "[filter:drop-shadow(0_0_7px_rgba(255,255,255,0.95))]";

// Liquid glass: saturated blur, translucent fill, and inset edge highlights
// so light catches the rounded rim like real glass.
const GLASS_DARK =
  "rounded-full border border-white/20 bg-[#0b0d16]/60 shadow-[inset_0_1px_1px_rgba(255,255,255,0.18),inset_0_-1px_1px_rgba(255,255,255,0.06),0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur-2xl backdrop-saturate-150";
const GLASS_LIGHT =
  "rounded-full border border-white/50 bg-white/60 shadow-[inset_0_1px_1px_rgba(255,255,255,0.7),inset_0_-1px_1px_rgba(255,255,255,0.25),0_8px_30px_rgba(30,27,75,0.14)] backdrop-blur-2xl backdrop-saturate-150";

function Wordmark({
  white,
  solid,
  glow,
}: {
  white: boolean;
  solid: string;
  glow: string;
}) {
  return (
    <a
      href="#top"
      className={`flex items-center gap-2.5 ${glow}`}
      aria-label="PreFlight home"
    >
      <span className="relative block h-[30px] w-[106px]" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={white ? "/logo-white.png" : "/logo.png"}
          alt=""
          className="absolute inset-0 m-auto h-[30px] w-auto"
        />
      </span>
      <span className={`font-display text-lg font-bold tracking-tight ${solid}`}>
        PreFlight
      </span>
    </a>
  );
}

function NavLinks({ muted, glow }: { muted: string; glow: string }) {
  return (
    <div className="hidden items-center gap-8 md:flex">
      <a
        href="#how-it-works"
        className={`text-sm font-medium transition-colors duration-150 ${muted} ${glow}`}
      >
        How it works
      </a>
    </div>
  );
}

function NavActions({
  user,
  muted,
  solid,
  glow,
  dark,
}: {
  user: NavUser | null;
  muted: string;
  solid: string;
  glow: string;
  dark: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {user ? (
        <>
          <a
            href="/dashboard"
            className={`pressable rounded-full px-4 py-2.5 text-sm font-medium transition-colors duration-150 ${muted} ${glow}`}
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
            <span className={`text-sm font-medium ${solid} ${glow}`}>
              {user.name?.split(" ")[0] ?? "Dashboard"}
            </span>
          </a>
        </>
      ) : (
        <>
          <a
            href="/login"
            className={`rounded-full px-4 py-2.5 text-sm font-medium transition-colors duration-150 ${muted} ${glow}`}
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
  );
}

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

  const t = reduced ? "" : SWAP;
  const solid = dark ? "text-white" : "text-ink";

  // Top bar (transparent): dimmer muted tone + halo glow on light.
  const topMuted = dark
    ? "text-white/70 hover:text-white"
    : "text-ink/60 hover:text-ink";
  const topGlow = dark ? "" : GLOW_TEXT;
  const topSprite = dark ? "" : GLOW_SPRITE;
  // Pill (glass): no glow needed, slightly brighter muted on light.
  const pillMuted = dark
    ? "text-white/70 hover:text-white"
    : "text-ink/70 hover:text-ink";

  return (
    <nav className="fixed inset-x-0 top-0 z-50">
      {/* Transparent top bar — fades out on scroll */}
      <div
        className={`mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5 ${t} ${
          scrolled
            ? "pointer-events-none -translate-y-1 opacity-0"
            : "translate-y-0 opacity-100"
        }`}
      >
        <Wordmark white={false} solid={solid} glow={topSprite} />
        <NavLinks muted={topMuted} glow={topGlow} />
        <NavActions
          user={user}
          muted={topMuted}
          solid={solid}
          glow={topGlow}
          dark={dark}
        />
      </div>
      {/* Floating glass pill — fades and settles in on scroll */}
      <div
        className={`absolute inset-x-0 top-3 ${t} ${
          scrolled
            ? "translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-2 scale-[0.98] opacity-0"
        }`}
      >
        <div
          className={`mx-auto flex w-[calc(100%-2rem)] max-w-[36rem] items-center justify-between px-5 py-2.5 ${
            dark ? GLASS_DARK : GLASS_LIGHT
          }`}
        >
          <Wordmark white={true} solid={solid} glow="" />
          <NavLinks muted={pillMuted} glow="" />
          <NavActions
            user={user}
            muted={pillMuted}
            solid={solid}
            glow=""
            dark={dark}
          />
        </div>
      </div>
    </nav>
  );
}
