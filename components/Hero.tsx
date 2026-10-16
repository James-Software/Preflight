"use client";

import Nav, { type NavUser } from "./Nav";

/* ------------------------------------------------------------------ */
/* Hero — Cloudflare-style: near-black page, one big purplish-blue     */
/* gradient bubble with a dotted texture and a soft bloom along the    */
/* bottom edge. White headline, white pill CTA. The gradient drifts    */
/* slowly; everything freezes under prefers-reduced-motion.            */
/* ------------------------------------------------------------------ */

const BUBBLE_GRADIENT =
  "linear-gradient(115deg, #2f46ff 0%, #5457f5 34%, #7c5cf0 64%, #9a4bf2 100%)";

const DOT_TEXTURE =
  "radial-gradient(rgba(255,255,255,0.20) 1.2px, transparent 1.3px)";

export default function Hero({ user }: { user: NavUser | null }) {
  return (
    <section id="top" className="relative bg-[#05060a]">
      <Nav user={user} dark />

      <div className="px-3 pb-8 pt-24 md:px-5 md:pt-28">
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[1.75rem] shadow-[0_30px_80px_-20px_rgba(90,80,250,0.45)] md:rounded-[2.5rem]">
          {/* gradient bubble */}
          <div
            aria-hidden="true"
            className="animate-bubble-drift absolute inset-0"
            style={{
              backgroundImage: BUBBLE_GRADIENT,
              backgroundSize: "220% 220%",
            }}
          />
          {/* dotted texture */}
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              backgroundImage: DOT_TEXTURE,
              backgroundSize: "24px 24px",
            }}
          />
          {/* top gloss */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/15 to-transparent"
          />
          {/* bottom bloom */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-72"
            style={{
              background:
                "radial-gradient(55% 95% at 50% 112%, rgba(255,255,255,0.55), rgba(255,255,255,0) 70%)",
            }}
          />

          <div className="relative px-6 py-24 text-center md:py-36">
            <h1
              className="animate-hero-rise font-display mx-auto max-w-4xl text-5xl font-bold tracking-tight text-white md:text-7xl"
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
