"use client";

import { useEffect, useRef } from "react";

/* ------------------------------------------------------------------ */
/* Shared flight path: screen % + recession scale + bank/pitch (deg).  */
/* t in [0,1]. Imported by PixelSky so the DOM wrapper and the sprite  */
/* stay in perfect sync.                                               */
/* ------------------------------------------------------------------ */

export function planeFlight(t: number) {
  const x = 8 + (68 - 8) * t; // 8% -> 68% of hero width
  const y = 66 - 54 * Math.pow(t, 1.5); // 66% -> 12%, accelerating climb
  const scale = 1 - 0.45 * Math.pow(t, 1.4); // 1 -> ~0.55: recedes into distance
  const bank = -15 * Math.sin(Math.PI * t); // gentle roll into the climb
  const pitch = -14 * Math.sin((Math.PI / 2) * t); // nose-up ramp (negative = nose-up in CSS rotate)
  return { x, y, scale, bank, pitch };
}

/* ------------------------------------------------------------------ */
/* Pixel-art jet, side view facing right (+X, the flight direction).   */
/* Hand-authored 44x21 ASCII map, one char per pixel. Rendered as SVG   */
/* rects with crispEdges at 4.5x.                                      */
/*                                                                     */
/* Palette (site brand):                                               */
/*   K ink #1e1b4b      selective outline, heavier on the belly        */
/*   W white #ffffff    top highlight run along the fuselage           */
/*   L #e6e3fb          body light                                     */
/*   M #a5b4fc          mid body                                       */
/*   D #818cf8          cheatline stripe + wing mid                    */
/*   S #6366f1          shade (belly dither, wingtip)                  */
/*   C #312e81          cockpit windows                                */
/* ------------------------------------------------------------------ */

const ART_W = 44;
const ART_H = 21;
const PX = 4.5; // display scale -> ~198px wide on screen

const PALETTE: Record<string, string> = {
  K: "#1e1b4b",
  W: "#ffffff",
  L: "#e6e3fb",
  M: "#a5b4fc",
  D: "#818cf8",
  S: "#6366f1",
  C: "#312e81",
};

const ART: string[] = [
  ".....KK.....................................",
  "....KMMK....................................",
  "....KMMMK...................................",
  "...KDMMMK...................................",
  "...KDMMMMK..................................",
  "...KMMMMMK..................................",
  "...KMMMMMMK.................................",
  "...KMMMMMMK.................................",
  "....KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK.......",
  "....KLLLLLLLLLLLLLLLLLLLLLLLLLLLLCCCLLK.....",
  "....KLLLLLLLLDDDDDDDDDDDDDDDDDDLLLLLLLLLK...",
  "....KMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMLMK..",
  ".....KSMSMSMSMSMSMSMSMSMSMSMSMSMSMSMSMSMK...",
  "........KKKKKKKKKKKKKKKKKKKKKKKKKKKKK.......",
  "...KMMMMMK..........KMMMMMMMK...............",
  "..KDDDDK.........KMMMMMMMK..................",
  "..............KDDDDDDDK.....................",
  "...........KDDDDDDDK........................",
  ".........KSSSSSSK...........................",
  "........KSSSSK..............................",
  "............................................",
];

interface Rect {
  x: number;
  y: number;
  fill: string;
}

// Flatten the map to rects once at module load.
const RECTS: Rect[] = [];
ART.forEach((row, y) => {
  for (let x = 0; x < row.length; x++) {
    const ch = row[x];
    if (ch === ".") continue;
    const fill = PALETTE[ch];
    if (fill) RECTS.push({ x, y, fill });
  }
});

interface PixelPlaneSpriteProps {
  /** rendered width in px */
  width?: number;
  className?: string;
}

/**
 * The pixel jet as a static, reusable sprite — the same hand-authored
 * rects, no animation. Used for the nav logo; the animated hero plane
 * below renders this too.
 */
export function PixelPlaneSprite({
  width = ART_W * PX,
  className,
}: PixelPlaneSpriteProps) {
  return (
    <svg
      width={width}
      height={(width * ART_H) / ART_W}
      viewBox={`0 0 ${ART_W} ${ART_H}`}
      shapeRendering="crispEdges"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {RECTS.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={1.02} height={1.02} fill={r.fill} />
      ))}
    </svg>
  );
}

interface PixelPlaneProps {
  /** 0..1 scroll progress of the takeoff, owned by PixelSky */
  getScrollP: () => number;
}

/**
 * Hand-authored pixel-art airplane. Scroll drives the pose (position and
 * recession scale come from the DOM wrapper in PixelSky via planeFlight;
 * nose-up tilt, a subtle bank wobble, and idle bob happen here). Reduced
 * motion renders one static parked frame and stops.
 */
export default function PixelPlane({ getScrollP }: PixelPlaneProps) {
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced) return; // static parked frame, no animation

    let raf = 0;
    let visible = true;
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0 },
    );
    observer.observe(inner);

    let st = 0; // smoothed scroll progress
    const start = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden || !visible) return;
      const target = Math.min(1, Math.max(0, getScrollP()));
      st += (target - st) * 0.22;
      if (Math.abs(target - st) < 0.0004) st = target;
      const f = planeFlight(st);
      const el = (now - start) / 1000;
      // Idle life layered over the scroll pose, always smooth.
      const wobble = 2.5 * Math.sin(el * 0.9); // subtle bank wobble
      const bob = 3 * Math.sin(el * 1.1); // gentle idle bob (px)
      inner.style.transform = `translateY(${bob.toFixed(2)}px) rotate(${(f.pitch + wobble).toFixed(2)}deg)`;
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [getScrollP]);

  return (
    <div
      ref={innerRef}
      className="pointer-events-none will-change-transform"
      aria-hidden="true"
    >
      <PixelPlaneSprite width={ART_W * PX} />
    </div>
  );
}
