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

/* Waypoint: glide here, hold, optionally click a button (by index). */
interface Waypoint {
  x: number;
  y: number;
  hold: number;
  click?: number;
}

/* One looping path per cursor. First waypoint = PARK spot (seamless start). */
const PATHS: Waypoint[][] = [
  [
    { x: 610, y: 190, hold: 700 },
    { x: 265, y: 294, hold: 350, click: 0 },
    { x: 340, y: 218, hold: 900 },
    { x: 610, y: 294, hold: 350, click: 2 },
    { x: 700, y: 420, hold: 800 },
  ],
  [
    { x: 235, y: 415, hold: 800 },
    { x: 435, y: 294, hold: 350, click: 1 },
    { x: 265, y: 294, hold: 350, click: 0 },
    { x: 680, y: 200, hold: 700 },
  ],
  [
    { x: 690, y: 420, hold: 600 },
    { x: 700, y: 150, hold: 500 },
    { x: 500, y: 210, hold: 500 },
    { x: 435, y: 294, hold: 1400, click: 1 },
    { x: 300, y: 450, hold: 700 },
  ],
];

const easeInOutCubic = (p: number) =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

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
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const [pressed, setPressed] = useState<number | null>(null);

  /* Cursor waypoint engine: one rAF loop drives all three cursors.
     Glide (eased) -> hold -> click -> next waypoint, looping forever.
     Writes translate3d straight to the <g> refs; React never re-renders
     per frame. Clicks are low-frequency, so the button press goes
     through state. Pauses off-screen and in hidden tabs. */
  useEffect(() => {
    if (reduced) return; // static parked frame
    const els = cursorRefs.current;
    const scene = sceneRef.current;
    if (!scene || els.some((e) => !e)) return;

    let pressTimer = 0;
    const doClick = (bi: number) => {
      setPressed(bi);
      window.clearTimeout(pressTimer);
      pressTimer = window.setTimeout(() => setPressed(null), 220);
    };

    interface CS {
      i: number;
      fx: number;
      fy: number;
      x: number;
      y: number;
      t: number;
      dur: number;
      phase: "hold" | "glide";
      holdT: number;
      fired: boolean;
    }
    const states: CS[] = PATHS.map((path) => ({
      i: 0,
      fx: path[0].x,
      fy: path[0].y,
      x: path[0].x,
      y: path[0].y,
      t: 0,
      dur: 0,
      phase: "hold",
      holdT: 0,
      fired: false,
    }));

    let visible = true;
    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0 },
    );
    io.observe(scene);

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (document.hidden || !visible) return;
      states.forEach((s, ci) => {
        const path = PATHS[ci];
        const wp = path[s.i];
        if (s.phase === "hold") {
          s.holdT += dt * 1000;
          if (s.holdT >= wp.hold) {
            const next = (s.i + 1) % path.length;
            const tgt = path[next];
            const dist = Math.hypot(tgt.x - s.x, tgt.y - s.y);
            s.i = next;
            s.fx = s.x;
            s.fy = s.y;
            s.t = 0;
            s.dur = Math.min(1600, Math.max(450, (dist / 420) * 1000));
            s.phase = "glide";
            s.holdT = 0;
            s.fired = false;
          }
        } else {
          s.t += dt * 1000;
          const p = Math.min(1, s.t / s.dur);
          const e = easeInOutCubic(p);
          const tgt = path[s.i];
          s.x = s.fx + (tgt.x - s.fx) * e;
          s.y = s.fy + (tgt.y - s.fy) * e;
          if (p >= 1) {
            s.phase = "hold";
            s.holdT = 0;
            if (tgt.click != null && !s.fired) {
              s.fired = true;
              doClick(tgt.click);
            }
          }
        }
        const el = els[ci];
        if (el)
          el.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0)`;
      });
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.clearTimeout(pressTimer);
    };
  }, [reduced]);

  return (
    <section className="bg-lavender py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="font-display text-center text-2xl font-bold tracking-tight text-ink md:text-3xl">
          Watch the swarm work.
        </h2>

        {/* Scene: one SVG, 880x540 design space, scales as a unit. */}
        <div
          ref={sceneRef}
          className="mx-auto mt-12 max-w-3xl"
          aria-hidden="true"
        >
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
                style={{
                  transform:
                    pressed === i ? "translateY(6px)" : "translateY(0px)",
                  transition: `transform 150ms ${EASE}`,
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
