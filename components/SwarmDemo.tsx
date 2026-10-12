"use client";

import { useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/* SwarmDemo — "Watch the swarm work."                                 */
/*                                                                    */
/* A hand-authored pixel-art scene: three agent cursors (the swarm)   */
/* roam a pixel browser window, clicking buttons on a tiny fake app.  */
/* Clicks depress the button, burst pixel particles, and once per     */
/* loop one cursor finds a bug — a red tag pops above the button.     */
/*                                                                    */
/* Everything lives in one SVG (viewBox 880x540) so the whole scene   */
/* scales together and stays aligned. Cursor motion runs on one rAF   */
/* loop writing translate3d directly to <g> refs — no React renders   */
/* per frame. Clicks/ripples/tags are low-frequency React state.      */
/* Reduced motion renders one clean static frame and never starts     */
/* the loop.                                                          */
/* ------------------------------------------------------------------ */

const INK = "#1e1b4b";
const INDIGO = "#6366f1";
const DEEP = "#4338CA";
const PERI = "#a5b4fc";
const LIGHT = "#e6e3fb";
const MIST = "#e0e7ff";
const VIOLET = "#8b5cf6";
const VIOLET_HI = "#c4b5fd";
const RED = "#ef4444";
const RED_DARK = "#b91c1c";

const EASE = "cubic-bezier(0.16,1,0.3,1)"; // James's motion spec

/* Classic arrow cursor, tip at (0,0). K = ink outline, F = cursor color. */
const CURSOR_MAP = [
  "K...........",
  "KK..........",
  "KFK.........",
  "KFFK........",
  "KFFFK.......",
  "KFFFFK......",
  "KFFFFFK.....",
  "KFFFFFFK....",
  "KFFFFFFFK...",
  "KFFFFFFFFK..",
  "KFFFFFFFFFK.",
  "KFFFFFKK....",
  "KFFFKK......",
  "KFKK........",
  "KK..........",
];
const CURSOR_SCALE = 3;
const CURSOR_COLORS = [INDIGO, VIOLET, PERI];

/** Renders an ASCII pixel map as SVG rects at (x, y), 1 char = s units. */
function PxMap({
  map,
  palette,
  x,
  y,
  s = 1,
}: {
  map: string[];
  palette: Record<string, string>;
  x: number;
  y: number;
  s?: number;
}) {
  const rects: React.ReactNode[] = [];
  map.forEach((row, ry) => {
    for (let x2 = 0; x2 < row.length; x2++) {
      const ch = row[x2];
      if (ch === ".") continue;
      const fill = palette[ch];
      if (!fill) continue;
      rects.push(
        <rect
          key={`${x2}-${ry}`}
          x={x + x2 * s}
          y={y + ry * s}
          width={s + 0.02}
          height={s + 0.02}
          fill={fill}
        />,
      );
    }
  });
  return <g>{rects}</g>;
}

interface ButtonSpec {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  hi: string | null;
  label: string;
  labelFill: string;
  outline: boolean;
}

const BUTTONS: ButtonSpec[] = [
  {
    id: "signup",
    x: 190,
    y: 300,
    w: 150,
    h: 52,
    fill: INDIGO,
    hi: PERI,
    label: "Sign up",
    labelFill: "#ffffff",
    outline: false,
  },
  {
    id: "login",
    x: 360,
    y: 300,
    w: 150,
    h: 52,
    fill: "#ffffff",
    hi: null,
    label: "Log in",
    labelFill: INK,
    outline: true,
  },
  {
    id: "trial",
    x: 530,
    y: 300,
    w: 160,
    h: 52,
    fill: VIOLET,
    hi: VIOLET_HI,
    label: "Start trial",
    labelFill: "#ffffff",
    outline: false,
  },
];

/** Parked cursor spots for the static frame (tip coordinates). */
const PARK = [
  { x: 610, y: 190 },
  { x: 235, y: 415 },
  { x: 690, y: 420 },
];

const POINTS = [
  {
    title: "Real browsers",
    body: "Tests run in real headless browsers. What the swarm sees is what your users see.",
  },
  {
    title: "Real diagnosis",
    body: "Root causes come from your code and terminal output, never guesses.",
  },
  {
    title: "Real control",
    body: "Nothing merges without you. Every fix arrives as a pull request.",
  },
];

export default function SwarmDemo() {
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const cursorRefs = useRef<(SVGGElement | null)[]>([]);
  const buttonRefs = useRef<(SVGGElement | null)[]>([]);

  return (
    <section className="bg-lavender py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="font-display text-center text-2xl font-bold tracking-tight text-ink md:text-3xl">
          Watch the swarm work.
        </h2>

        {/* Scene: one SVG, 880x540 design space, scales as a unit. */}
        <div className="mx-auto mt-12 max-w-3xl" aria-hidden="true">
          <svg
            viewBox="0 0 880 540"
            className="h-auto w-full"
            shapeRendering="crispEdges"
            role="img"
            aria-label="Pixel-art animation of three AI agent cursors testing an app in a browser window"
          >
            {/* ------- computer ------- */}
            {/* frame */}
            <rect
              x={150}
              y={50}
              width={580}
              height={440}
              fill="#ffffff"
              stroke={INK}
              strokeWidth={4}
            />
            {/* browser chrome */}
            <rect x={150} y={50} width={580} height={60} fill="#eef0ff" />
            <rect x={150} y={106} width={580} height={4} fill={INK} />
            {/* traffic lights */}
            <rect x={172} y={74} width={12} height={12} fill="#f87171" />
            <rect x={192} y={74} width={12} height={12} fill="#fbbf24" />
            <rect x={212} y={74} width={12} height={12} fill="#34d399" />
            {/* url bar */}
            <rect
              x={244}
              y={70}
              width={300}
              height={28}
              fill="#ffffff"
              stroke={INK}
              strokeWidth={3}
            />
            <rect x={256} y={80} width={130} height={8} fill="#c7d2fe" />

            {/* ------- fake app ------- */}
            <rect x={190} y={140} width={220} height={16} fill={INK} />
            <rect x={190} y={164} width={340} height={10} fill={MIST} />
            <rect x={190} y={180} width={260} height={10} fill={MIST} />
            <rect x={190} y={216} width={60} height={10} fill={PERI} />
            {/* text field */}
            <rect
              x={190}
              y={232}
              width={300}
              height={44}
              fill="#ffffff"
              stroke={INK}
              strokeWidth={3}
            />
            <rect x={204} y={248} width={150} height={10} fill={MIST} />

            {/* buttons */}
            {BUTTONS.map((b, i) => (
              <g
                key={b.id}
                ref={(el) => {
                  buttonRefs.current[i] = el;
                }}
              >
                <rect
                  x={b.x}
                  y={b.y}
                  width={b.w}
                  height={b.h}
                  fill={b.fill}
                  stroke={INK}
                  strokeWidth={b.outline ? 3 : 0}
                />
                {b.hi && (
                  <rect
                    x={b.x + 4}
                    y={b.y + 4}
                    width={b.w - 8}
                    height={8}
                    fill={b.hi}
                  />
                )}
                <text
                  x={b.x + b.w / 2}
                  y={b.y + 33}
                  textAnchor="middle"
                  fontSize={20}
                  fontWeight={600}
                  fill={b.labelFill}
                  fontFamily="'Space Grotesk', sans-serif"
                >
                  {b.label}
                </text>
              </g>
            ))}

            {/* ------- parked cursors (animated in the next pass) ------- */}
            {PARK.map((p, i) => (
              <g
                key={i}
                ref={(el) => {
                  cursorRefs.current[i] = el;
                }}
                style={{
                  transform: `translate3d(${p.x}px, ${p.y}px, 0)`,
                }}
              >
                <PxMap
                  map={CURSOR_MAP}
                  palette={{ K: INK, F: CURSOR_COLORS[i] }}
                  x={0}
                  y={0}
                  s={CURSOR_SCALE}
                />
              </g>
            ))}
          </svg>
        </div>

        {/* ------- explanation ------- */}
        <div className="mx-auto mt-12 grid max-w-4xl gap-8 md:grid-cols-3">
          {POINTS.map((p) => (
            <div key={p.title} className="text-center md:text-left">
              <h3 className="text-sm font-semibold text-ink">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink/60">
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
