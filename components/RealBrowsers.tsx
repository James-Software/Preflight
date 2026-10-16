"use client";

import { useEffect, useState } from "react";

/* ------------------------------------------------------------------ */
/* RealBrowsers — "Every agent has their own browser."                  */
/*                                                                    */
/* Dark section replacing the old swarm demo. Compares simulated       */
/* browsers (a script pretending to browse) with PreFlight's real      */
/* Chromium instances. The real-browser card carries an animated       */
/* mini browser: an agent cursor roams on a 9s loop, click pings fire  */
/* where it lands, and evidence chips pop in sync. Static under        */
/* prefers-reduced-motion.                                            */
/* ------------------------------------------------------------------ */

const PINGS = [
  { left: "44%", top: "40%", delay: "2.7s" },
  { left: "30%", top: "74%", delay: "5.4s" },
  { left: "70%", top: "58%", delay: "8.1s" },
];

const CHIPS = [
  { left: "47%", top: "28%", delay: "3.2s", label: "Console error" },
  { left: "33%", top: "62%", delay: "5.9s", label: "Failed request" },
  { left: "58%", top: "46%", delay: "8.4s", label: "Layout shift" },
];

function Check({ className = "" }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5.5 8.2l1.8 1.8 3.2-3.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Cross({ className = "" }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6 6l4 4M10 6l-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function RealBrowsers() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const cursorAnim = reduced ? "" : "animate-agent-cursor";
  const pingAnim = reduced ? "" : "animate-click-ping";
  const chipAnim = reduced ? "" : "animate-chip-pop";

  return (
    <section
      id="how-it-works"
      className="scroll-mt-20 bg-[#05060a] py-24 md:py-32"
    >
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-xs font-semibold tracking-[0.22em] text-primary">
          WHY REAL BROWSERS
        </p>
        <h2 className="font-display mt-4 max-w-2xl text-3xl font-bold tracking-tight text-white md:text-5xl">
          Every agent has their own browser.
        </h2>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/60 md:text-lg">
          Simulators guess. Each PreFlight agent drives a real Chromium
          browser over CDP. Real rendering, real JavaScript, real network. If
          a bug can bite a user, it bites our agents first.
        </p>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {/* Simulated — dim, static */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-7 opacity-75">
            <p className="text-xs font-semibold tracking-[0.22em] text-white/35">
              SIMULATED
            </p>
            <h3 className="font-display mt-3 text-xl font-bold text-white/85">
              A script pretending to browse
            </h3>
            <div className="mt-5 overflow-hidden rounded-xl border border-white/10 bg-black/40 p-4 font-mono text-[11px] leading-relaxed text-white/35">
              <p>document.querySelector(&quot;#buy&quot;).click()</p>
              <p className="text-white/25">
                {"// no render, no events, no console"}
              </p>
              <p className="mt-2 text-white/40">✓ passed (it always passes)</p>
            </div>
            <ul className="mt-6 space-y-3.5 text-sm leading-relaxed text-white/50">
              <li className="flex gap-3">
                <Cross className="mt-0.5 text-white/30" />
                Renders nothing, so layout bugs are invisible
              </li>
              <li className="flex gap-3">
                <Cross className="mt-0.5 text-white/30" />
                Fake events, so broken handlers slip through
              </li>
              <li className="flex gap-3">
                <Cross className="mt-0.5 text-white/30" />
                No console or network, so runtime errors go unheard
              </li>
            </ul>
          </div>

          {/* Real — glowing, animated */}
          <div className="rounded-2xl border border-primary/30 bg-gradient-to-b from-primary/10 to-transparent p-7 shadow-[0_20px_60px_-20px_rgba(99,102,241,0.45)]">
            <p className="text-xs font-semibold tracking-[0.22em] text-primary">
              PREFLIGHT
            </p>
            <h3 className="font-display mt-3 text-xl font-bold text-white">
              A real Chromium, per agent
            </h3>

            {/* mini browser */}
            <div className="mt-5 overflow-hidden rounded-xl border border-white/10 bg-[#0a0c16]">
              <div className="flex items-center gap-3 border-b border-white/10 px-4 py-2.5">
                <div className="flex gap-1.5" aria-hidden="true">
                  <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                </div>
                <div className="flex-1 truncate rounded-full bg-white/5 px-3 py-1 text-center text-[11px] text-white/40">
                  your-app.com
                </div>
                <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-white/60">
                  <span
                    className={`h-1.5 w-1.5 rounded-full bg-emerald-400 ${reduced ? "" : "animate-pulse"}`}
                    aria-hidden="true"
                  />
                  LIVE
                </span>
              </div>

              <div className="relative h-60" aria-hidden="true">
                {/* fake page skeleton */}
                <div className="absolute inset-x-6 top-5 h-7 rounded-md bg-white/10" />
                <div className="absolute inset-x-6 top-16 h-20 rounded-lg bg-gradient-to-br from-primary/25 to-primary/5" />
                <div className="absolute left-6 top-40 h-8 w-24 rounded-full bg-primary/70" />
                <div className="absolute left-36 top-40 h-8 w-24 rounded-full border border-white/20" />
                <div className="absolute inset-x-6 top-[13.5rem] space-y-2">
                  <div className="h-2 rounded bg-white/10" />
                  <div className="h-2 w-2/3 rounded bg-white/10" />
                </div>

                {/* click pings */}
                {PINGS.map((p, i) =>
                  reduced ? null : (
                    <div
                      key={i}
                      className={`absolute h-6 w-6 rounded-full border-2 border-white/70 ${pingAnim}`}
                      style={{ left: p.left, top: p.top, animationDelay: p.delay }}
                    />
                  ),
                )}

                {/* agent cursor */}
                <div
                  className={`absolute z-10 ${cursorAnim}`}
                  style={
                    reduced ? { left: "44%", top: "40%" } : undefined
                  }
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="white"
                    stroke="#1e1b4b"
                    strokeWidth="1.5"
                  >
                    <path d="M5.5 3.5L19 11l-6.8 1.6L9 19z" strokeLinejoin="round" />
                  </svg>
                </div>

                {/* evidence chips */}
                {CHIPS.map((c, i) => (
                  <div
                    key={i}
                    className={`absolute z-10 rounded-full border border-white/15 bg-[#141828]/95 px-2.5 py-1 text-[11px] font-medium whitespace-nowrap text-white/85 shadow-lg ${chipAnim}`}
                    style={
                      reduced
                        ? { left: c.left, top: c.top }
                        : { left: c.left, top: c.top, animationDelay: c.delay, opacity: 0 }
                    }
                  >
                    {c.label}
                  </div>
                ))}
              </div>
            </div>

            <ul className="mt-6 space-y-3.5 text-sm leading-relaxed text-white/75">
              <li className="flex gap-3">
                <Check className="mt-0.5 text-primary" />
                Real rendering engine, so it sees what users see
              </li>
              <li className="flex gap-3">
                <Check className="mt-0.5 text-primary" />
                Real clicks, typing, scrolling, and navigation
              </li>
              <li className="flex gap-3">
                <Check className="mt-0.5 text-primary" />
                Screenshots, console errors, and failed requests as evidence
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
