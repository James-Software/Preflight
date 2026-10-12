"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { PixelPlaneSprite } from "./PixelPlane";

/** px scrolled before the bar morphs into a floating pill */
const SCROLL_AFTER = 32;

// James's motion spec: 100-300ms, cubic-bezier(0.16,1,0.3,1). Only the
// morphing properties transition — never transition-all. Written as full
// literal class strings so Tailwind's scanner picks them up.
const MORPH_TRANSITION =
  "transition-[width,max-width,margin-top,padding,border-radius,border-color,box-shadow,background-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]";

// Soft white halo behind nav content while the bar is transparent (top of
// page), so dark text stays readable over the cloudscape. Only active in
// the non-pill state — the pill carries its own white background.
const GLOW_TEXT =
  "[text-shadow:0_0_14px_rgba(255,255,255,0.95),0_0_34px_rgba(255,255,255,0.85)]";
const GLOW_SPRITE = "[filter:drop-shadow(0_0_7px_rgba(255,255,255,0.95))]";

export default function Nav() {
  const [scrolled, setScrolled] = useState(
    () => typeof window !== "undefined" && window.scrollY > SCROLL_AFTER,
  );
  const [reduced, setReduced] = useState(false);
  const { data: session, status } = useSession();

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

  return (
    <nav className="fixed inset-x-0 top-0 z-50">
      <div
        className={`mx-auto flex items-center justify-between ${t} ${
          scrolled
            ? "mt-3 w-[calc(100%-2rem)] max-w-[36rem] rounded-full border border-ink/10 bg-white/90 px-5 py-2.5 shadow-[0_8px_30px_rgba(30,27,75,0.12)] backdrop-blur-md"
            : "w-full max-w-6xl rounded-none border border-transparent bg-transparent px-6 py-5 shadow-none"
        }`}
      >
        <a
          href="#top"
          className={`flex items-center gap-2.5 ${scrolled ? "" : GLOW_SPRITE}`}
          aria-label="Preflight home"
        >
          <PixelPlaneSprite width={30} />
          <span
            className={`font-display text-lg font-bold tracking-tight text-ink ${
              scrolled ? "" : GLOW_TEXT
            }`}
          >
            Preflight
          </span>
        </a>
        <div className="hidden items-center gap-8 md:flex">
          <a
            href="#how-it-works"
            className={`text-sm font-medium text-ink/60 transition-colors duration-150 hover:text-ink ${
              scrolled ? "" : GLOW_TEXT
            }` }
          >
            How it works
          </a>
        </div>
        <div className="flex items-center gap-1.5">
          {status !== "loading" &&
            (session?.user ? (
              <a
                href="/dashboard"
                className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors duration-150 hover:bg-ink/5"
                aria-label="Open dashboard"
              >
                {session.user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={session.user.image}
                    alt=""
                    className="h-8 w-8 rounded-full ring-1 ring-ink/10"
                  />
                ) : null}
                <span
                  className={`text-sm font-medium text-ink ${
                    scrolled ? "" : GLOW_TEXT
                  }`}
                >
                  {session.user.name?.split(" ")[0] ?? "Dashboard"}
                </span>
              </a>
            ) : (
              <>
                <a
                  href="/login"
                  className={`rounded-full px-4 py-2.5 text-sm font-medium text-ink/70 transition-colors duration-150 hover:text-ink ${
                    scrolled ? "" : GLOW_TEXT
                  }`}
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
            ))}
        </div>
      </div>
    </nav>
  );
}
