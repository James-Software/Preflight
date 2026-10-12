"use client";

import { useRef } from "react";
import Nav from "./Nav";
import PixelSky from "./PixelSky";

export default function Hero() {
  const heroRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <section
      id="top"
      ref={heroRef}
      className="relative overflow-hidden bg-white"
      style={{ minHeight: "112svh" }}
    >
      <PixelSky heroRef={heroRef} contentRef={contentRef} />
      <Nav />

      <div
        ref={contentRef}
        className="relative z-20 mx-auto max-w-3xl px-6 pt-36 text-center will-change-transform md:pt-44"
      >
        <p className="text-xs font-semibold tracking-[0.22em] text-primary">
          AI QA SWARM
        </p>
        <h1 className="font-display mt-5 text-5xl font-bold tracking-tight text-ink md:text-7xl">
          Cleared for <span className="text-gradient">takeoff.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-ink/65">
          Preflight sends a swarm of AI agents to test your app like real
          users. Every bug they find comes back as a fix.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href="#early-access"
            className="pressable btn-gradient w-full rounded-full px-7 py-3.5 text-sm font-medium text-white sm:w-auto"
          >
            Get early access
          </a>
          <a
            href="#how-it-works"
            className="pressable w-full rounded-xl border border-mist bg-white px-7 py-3.5 text-sm font-semibold text-ink hover:border-primary/60 sm:w-auto"
          >
            See how it works
          </a>
        </div>
      </div>
    </section>
  );
}
