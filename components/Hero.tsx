"use client";

import Nav, { type NavUser } from "./Nav";
import PlasmaSquare from "./PlasmaSquare";

/* ------------------------------------------------------------------ */
/* Hero — one big square filling ~96% of the viewport, rendered as     */
/* living plasma in the classic gradient's blues (#4e2fd8 → #6a6df5   */
/* → #8aa5ff, diagonal to top-right). The square is identical in both  */
/* themes (white headline stays on the plasma); only the page behind   */
/* it flips (#fafafa light, #05060a dark).                             */
/* ------------------------------------------------------------------ */

export default function Hero({ user }: { user: NavUser | null }) {
  return (
    <section
      id="top"
      className="relative flex min-h-svh flex-col overflow-x-clip dark:bg-[#05060a]"
    >
      <Nav user={user} />

      <div className="flex min-w-0 flex-1 px-[2vw] pb-[2vh] pt-[84px]">
        <div
          className="relative flex min-w-0 w-full flex-1 items-center justify-center overflow-hidden rounded-[1.75rem] md:rounded-[2.5rem]"
        >
          {/* The square itself: living plasma in the classic gradient's
              blues, clipped to the rounded box. */}
          <PlasmaSquare />

          <div className="relative min-w-0 w-full px-6 py-16 text-center md:py-20">
            <h1
              className="animate-hero-rise mx-auto max-w-4xl font-sans text-5xl font-semibold tracking-[-0.035em] text-white md:text-8xl"
              style={{ textShadow: "0 2px 24px rgba(30,20,120,0.35)" }}
            >
              Is your app ready to fly?
            </h1>
            <p
              className="animate-hero-rise mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/80"
              style={{ animationDelay: "120ms" }}
            >
              PreFlight sends a swarm of AI agents to test your app like real
              users. Every bug they find comes back as fix.
            </p>
            <div
              className="animate-hero-rise mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
              style={{ animationDelay: "240ms" }}
            >
              <a
                href="#early-access"
                className="pressable w-full rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-ink shadow-[0_10px_30px_-8px_rgba(20,16,80,0.5)] transition-colors duration-150 hover:bg-white/90 sm:w-auto"
              >
                Get early access
              </a>
              <a
                href="#how-it-works"
                className="pressable w-full rounded-full border border-white/35 px-7 py-3.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-white/10 sm:w-auto"
              >
                See how it works
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
