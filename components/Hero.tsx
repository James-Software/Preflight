"use client";

import Nav, { type NavUser } from "./Nav";

/* ------------------------------------------------------------------ */
/* Hero — Cloudflare-style: near-black page, one big purplish-blue     */
/* gradient bubble filling ~96% of the viewport. Bright bubble light   */
/* across the top edge (dots fade out up there), soft light on both    */
/* sides, bloom along the bottom. The gradient drifts slowly;          */
/* everything freezes under prefers-reduced-motion.                    */
/* ------------------------------------------------------------------ */

const BUBBLE_GRADIENT =
  "linear-gradient(to top right, #4e2fd8 0%, #6a6df5 48%, #8aa5ff 100%)";

const DOT_TEXTURE =
  "radial-gradient(rgba(255,255,255,0.20) 1.2px, transparent 1.3px)";

export default function Hero({ user }: { user: NavUser | null }) {
  return (
    <section
      id="top"
      className="relative flex min-h-svh flex-col bg-[#05060a]"
    >
      <Nav user={user} />

      <div className="flex flex-1 px-[2vw] pb-[2vh] pt-[84px]">
        <div
          className="relative flex w-full flex-1 items-center justify-center overflow-hidden rounded-[1.75rem] md:rounded-[2.5rem]"
          style={{
            boxShadow: "0 30px 80px -20px rgba(90,80,250,0.45)",
          }}
        >
          {/* gradient bubble — static, no drift */}
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{ backgroundImage: BUBBLE_GRADIENT }}
          />
          {/* dotted texture: inner-glow shaped fade — four straight edge
              fades composited (like an inset box-shadow), so dots dissolve
              near every edge instead of in an ellipse */}
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              WebkitMaskImage:
                "linear-gradient(to bottom, transparent, black 16%), linear-gradient(to top, transparent, black 16%), linear-gradient(to right, transparent, black 10%), linear-gradient(to left, transparent, black 10%)",
              WebkitMaskComposite: "source-in",
              maskImage:
                "linear-gradient(to bottom, transparent, black 16%), linear-gradient(to top, transparent, black 16%), linear-gradient(to right, transparent, black 10%), linear-gradient(to left, transparent, black 10%)",
              maskComposite: "intersect",
            }}
          >
            <div
              aria-hidden="true"
              className="animate-dot-rise absolute inset-0"
              style={{
                backgroundImage: DOT_TEXTURE,
                backgroundSize: "12px 12px",
              }}
            />
          </div>
          {/* bright light band across the top, no circular blobs */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-white/30 to-transparent"
          />
          {/* inner edge light — its own layer above the gradient so the
              opaque layers can't cover it (inset shadows on the container
              get buried under absolutely-positioned children) */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[1.75rem] md:rounded-[2.5rem]"
            style={{
              boxShadow:
                "inset 0 0 0 1px rgba(255,255,255,0.45), inset 0 0 45px rgba(255,255,255,0.42), inset 0 2px 1px rgba(255,255,255,0.6), inset 0 -1px 0 rgba(255,255,255,0.2)",
            }}
          />

          <div className="relative px-6 py-16 text-center md:py-20">
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
