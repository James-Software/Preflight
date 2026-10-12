"use client";

import { useCallback, useEffect, useRef } from "react";

/* ------------------------------------------------------------------ */
/* Deterministic RNG + value noise (stable clouds across renders)       */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function makeNoise(seed: number) {
  const rand = mulberry32(seed);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const fade = (t: number) => t * t * (3 - 2 * t);
  const grad = (h: number, x: number, y: number) =>
    ((h & 1) === 0 ? x : -x) + ((h & 2) === 0 ? y : -y);
  const base = (x: number, y: number) => {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = fade(x);
    const v = fade(y);
    const aa = perm[X] + Y;
    const bb = perm[X + 1] + Y;
    return (
      lerp(
        lerp(grad(perm[aa], x, y), grad(perm[bb], x - 1, y), u),
        lerp(grad(perm[aa + 1], x, y - 1), grad(perm[bb + 1], x - 1, y - 1), u),
        v,
      ) *
        0.5 +
      0.5
    );
  };
  // two octaves: large billows + fine breakup
  return (x: number, y: number) =>
    base(x, y) * 0.68 + base(x * 2.17 + 7.3, y * 2.17 + 3.1) * 0.32;
}

/* ------------------------------------------------------------------ */
/* Color ramp: dense core -> dissolving edge, per-dot jitter           */
/* ------------------------------------------------------------------ */

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = cl((n >> 16) + amt);
  const g = cl(((n >> 8) & 0xff) + amt);
  const b = cl((n & 0xff) + amt);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function ramp(d: number, rand: () => number) {
  const j = (rand() - 0.5) * 12; // ±6 lightness jitter: hand-made feel
  if (d >= 0.74) return shade("#1d4ed8", j);
  if (d >= 0.52) return shade("#3b82f6", j);
  if (d >= 0.34) return shade("#93c5fd", j);
  return shade("#dbe4fd", j);
}

/* ------------------------------------------------------------------ */
/* Cloud stamping: overlapping elliptical blobs, halftone falloff      */
/* ------------------------------------------------------------------ */

interface Blob {
  ox: number;
  oy: number;
  rx: number;
  ry: number;
  amp: number;
}

const DOT = 3; // px per dot, CSS px

function stampCloud(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  seed: number,
  wisp = false,
  // Shared per-layer occupancy grid + this cloud's top-left in layer space.
  // Overlapping clouds skip cells already claimed, so stacked clouds merge
  // into one uniform-density mass instead of double-stamping dense blobs.
  occ: Set<string>,
  bx: number,
  by: number,
) {
  const rand = mulberry32(seed);
  const noise = makeNoise(seed ^ 0x9e3779b9);
  const cx = W / 2;
  const cy = H / 2;

  // One big billow, flanking puffs, a top lift, wispy tails.
  // Offsets/radii are fractions of W so clouds scale cleanly.
  const blobs: Blob[] = [
    { ox: 0.0, oy: 0.03, rx: 0.3, ry: 0.21, amp: 1.0 },
    { ox: -0.27, oy: 0.09, rx: 0.2, ry: 0.15, amp: 0.92 },
    { ox: 0.28, oy: 0.08, rx: 0.21, ry: 0.16, amp: 0.92 },
    { ox: 0.03, oy: -0.1, rx: 0.16, ry: 0.13, amp: 0.86 },
    { ox: -0.14, oy: -0.05, rx: 0.13, ry: 0.11, amp: 0.8 },
    { ox: -0.44, oy: 0.11, rx: 0.11, ry: 0.08, amp: 0.68 },
    { ox: 0.45, oy: 0.11, rx: 0.11, ry: 0.08, amp: 0.68 },
  ];
  // per-cloud personality: slight horizontal skew of the whole mass
  const skew = (rand() - 0.5) * 0.07;

  for (let gy = 0; gy * DOT < H; gy++) {
    for (let gx = 0; gx * DOT < W; gx++) {
      const px = (gx + 0.5) * DOT;
      const py = (gy + 0.5) * DOT;
      const nx = (px - cx) / W + skew;
      const ny = (py - cy) / W;
      let d = 0;
      for (const b of blobs) {
        const dx = nx - b.ox;
        const dy = ny - b.oy;
        const e = (dx * dx) / (b.rx * b.rx) + (dy * dy) / (b.ry * b.ry);
        const v = b.amp * Math.exp(-e * 2.1);
        if (v > d) d = v;
      }
      if (d < 0.1) continue;
      // organic breakup: noise thins the mass, more at the edges
      const n = noise(px / 52, py / 52);
      d = d * (0.68 + 0.62 * n);
      if (wisp) d *= 0.6; // wisps never form solid cores
      if (d < 0.12) continue;
      if (rand() > Math.min(1, d * 1.02)) continue;
      // Layer-space 3px grid cell (DOT=3): skip if another cloud in this
      // layer already claimed it, so overlaps merge like real clouds.
      const key = `${Math.round((bx + gx * DOT) / 3)},${Math.round((by + gy * DOT) / 3)}`;
      if (occ.has(key)) continue;
      occ.add(key);
      ctx.fillStyle = wisp ? ramp(Math.min(d, 0.33), rand) : ramp(d, rand);
      ctx.fillRect(gx * DOT, gy * DOT, DOT, DOT);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Cloudscape: 3 depth layers, mouse parallax + visible wind drift    */
/* Each cloud is its own canvas so it can travel across the sky and   */
/* wrap around the edges. Layers sink with scroll (depth on takeoff).  */
/* ------------------------------------------------------------------ */

interface CloudSpec {
  seed: number;
  w: number; // width px at 1440px reference
  y: number; // base center, fraction of hero height
  x0: number; // base x phase, fraction of hero width
  /** pale sparse dots only — no solid core. Used where a dense core would
   *  sit against the parked plane or the first stretch of climb corridor. */
  wisp?: boolean;
}

interface LayerSpec {
  clouds: CloudSpec[];
  mouse: number; // max px of mouse parallax
  scroll: number; // px of downward drift over the takeoff
  speed: number; // px/s of constant wind drift (leftward)
}

const MARGIN = 120; // px beyond each edge where clouds spawn/recycle

const LAYERS: LayerSpec[] = [
  {
    clouds: [
      { x0: 0.05, y: 0.12, w: 640, seed: 1103 },
      { x0: 0.3, y: 0.06, w: 420, seed: 1104 },
      { x0: 0.52, y: 0.16, w: 720, seed: 2207 },
      { x0: 0.72, y: 0.08, w: 380, seed: 1105 },
      { x0: 0.9, y: 0.14, w: 560, seed: 1106 },
      { x0: 0.2, y: 0.23, w: 300, seed: 1107 },
      { x0: 0.62, y: 0.25, w: 340, seed: 1108 },
      // Fillers: keep the top band covered as clouds drift left (ultrawide voids)
      { x0: 0.82, y: 0.2, w: 440, seed: 1201 },
      { x0: 0.98, y: 0.1, w: 520, seed: 1202 },
      { x0: 0.42, y: 0.1, w: 360, seed: 1203, wisp: true },
      { x0: 0.14, y: 0.05, w: 380, seed: 1204, wisp: true },
    ],
    mouse: 10,
    scroll: 30,
    speed: 7,
  },
  {
    clouds: [
      { x0: 0.02, y: 0.42, w: 560, seed: 4417 },
      { x0: 0.25, y: 0.55, w: 380, seed: 4418, wisp: true },
      { x0: 0.45, y: 0.38, w: 640, seed: 5523 },
      { x0: 0.68, y: 0.52, w: 420, seed: 4419, wisp: true },
      { x0: 0.88, y: 0.44, w: 600, seed: 5524 },
      { x0: 0.12, y: 0.62, w: 300, seed: 4420, wisp: true },
      { x0: 0.58, y: 0.66, w: 360, seed: 4421, wisp: true },
      // Fillers: solid right-side clouds so the right flank reads on landing
      // (their left halves dissolve into the headline clear-stage — by design)
      { x0: 0.9, y: 0.4, w: 460, seed: 4601 },
      { x0: 1.0, y: 0.55, w: 500, seed: 4602 },
      { x0: 0.94, y: 0.66, w: 420, seed: 4603 },
      { x0: 0.34, y: 0.62, w: 340, seed: 4604, wisp: true },
    ],
    mouse: 22,
    scroll: 60,
    speed: 12,
  },
  {
    clouds: [
      { x0: 0.1, y: 0.88, w: 680, seed: 7731 },
      { x0: 0.38, y: 0.95, w: 420, seed: 7732 },
      { x0: 0.62, y: 0.84, w: 600, seed: 8837, wisp: true },
      { x0: 0.85, y: 0.92, w: 480, seed: 7733 },
      { x0: 0.25, y: 0.78, w: 320, seed: 7734, wisp: true },
      { x0: 0.5, y: 0.74, w: 280, seed: 7735, wisp: true },
      // Fillers: bottom band coverage as clouds drift left (ultrawide voids)
      { x0: 0.72, y: 0.9, w: 520, seed: 7901 },
      { x0: 0.96, y: 0.8, w: 440, seed: 7902, wisp: true },
      { x0: 0.56, y: 0.94, w: 400, seed: 7903 },
      { x0: 0.18, y: 0.94, w: 360, seed: 7904, wisp: true },
    ],
    mouse: 38,
    scroll: 95,
    speed: 20,
  },
];

interface DitherCloudsProps {
  /** 0..1 scroll progress of the takeoff, owned by PixelSky */
  getScrollP: () => number;
}

export default function DitherClouds({ getScrollP }: DitherCloudsProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const layerRefs = useRef<(HTMLDivElement | null)[]>([]);
  // cloudRefs[li][ci] = { el, cw, ch, seed }
  const cloudRefs = useRef<
    { el: HTMLDivElement; cw: number; ch: number; seed: number }[][]
  >([]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const build = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const s = Math.max(0.72, Math.min(1.3, w / 1440));

      cloudRefs.current = LAYERS.map((layer, li) => {
        const host = layerRefs.current[li];
        if (!host) return [];
        host.innerHTML = "";
        // One occupancy grid per layer, built in deterministic
        // layer.clouds order so the merged result is stable.
        const occ = new Set<string>();
        return layer.clouds.map((c) => {
          const cw = Math.ceil(c.w * s);
          const ch = Math.ceil(cw * 0.42);
          const el = document.createElement("div");
          el.style.position = "absolute";
          el.style.left = "0";
          el.style.top = "0";
          el.style.willChange = "transform";
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(cw * dpr);
          canvas.height = Math.ceil(ch * dpr);
          canvas.style.width = `${cw}px`;
          canvas.style.height = `${ch}px`;
          canvas.style.display = "block";
          // Base top-left at t=0 in layer space (matches place() with
          // animate=false): the occupancy key must live in layer space,
          // not canvas space.
          const bx = c.x0 * w - cw - MARGIN;
          const by = c.y * h - ch / 2;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.scale(dpr, dpr);
            stampCloud(ctx, cw, ch, c.seed, !!c.wisp, occ, bx, by);
          }
          el.appendChild(canvas);
          host.appendChild(el);
          return { el, cw, ch, seed: c.seed };
        });
      });
    };

    const bobOf = (seed: number) => ({
      amp: 8 + (seed % 7),
      period: 9 + (seed % 8),
      phase: ((seed % 628) / 100) * Math.PI,
    });

    const place = (
      mx: number,
      my: number,
      t: number,
      animate: boolean,
    ) => {
      const p = getScrollP();
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      LAYERS.forEach((layer, li) => {
        const el = layerRefs.current[li];
        if (!el) return;
        // Layer: mouse parallax + scroll-linked sinking (the depth effect).
        const dx = animate ? mx * layer.mouse : 0;
        const dy = animate ? my * layer.mouse * 0.45 + p * layer.scroll : p * layer.scroll;
        el.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0)`;

        // Clouds: constant wind drift with edge wrap + gentle individual bob.
        const clouds = cloudRefs.current[li] ?? [];
        clouds.forEach((c, ci) => {
          const spec = layer.clouds[ci];
          const span = w + c.cw + MARGIN * 2;
          const travel = animate ? t * layer.speed : 0;
          const raw = (((spec.x0 * w - travel) % span) + span) % span;
          // Wrap only once the whole cloud is fully past the left edge
          // (right edge at cx + cw, MARGIN to spare) — wide clouds used to
          // visibly snap out while still on-screen.
          const cx = raw - c.cw - MARGIN;
          let cy = spec.y * h - c.ch / 2;
          if (animate) {
            const b = bobOf(c.seed);
            cy += Math.sin((t * 2 * Math.PI) / b.period + b.phase) * b.amp;
          }
          c.el.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;
        });
      });
    };

    build();
    place(0, 0, 0, false);

    if (reduced) return;

    let mx = 0;
    let my = 0;
    let tmx = 0;
    let tmy = 0;
    const onMouse = (e: MouseEvent) => {
      tmx = (e.clientX / window.innerWidth - 0.5) * 2;
      tmy = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("mousemove", onMouse, { passive: true });

    // Accumulated active time: only advances on frames that actually place.
    // The old wall-clock (now - start) kept accruing while the tab was
    // hidden or the hero was off-screen, so clouds teleported on return.
    let lastNow = performance.now();
    let activeT = 0;
    let raf = 0;
    let heroVisible = true;
    const io = new IntersectionObserver(
      (entries) => {
        heroVisible = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0 },
    );
    io.observe(wrap);
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      // Clamp the delta: rAF pauses in hidden tabs, so without this the
      // whole hidden duration would land in one frame and teleport clouds.
      const dt = Math.min((now - lastNow) / 1000, 0.1);
      lastNow = now;
      if (document.hidden || !heroVisible) return;
      activeT += dt;
      mx += (tmx - mx) * 0.055;
      my += (tmy - my) * 0.055;
      place(mx, my, activeT, true);
    };
    raf = requestAnimationFrame(tick);

    let rT: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(rT);
      rT = setTimeout(build, 250);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("resize", onResize);
      clearTimeout(rT);
    };
  }, [getScrollP]);

  return (
    <div
      ref={wrapRef}
      className="pointer-events-none absolute inset-0 z-0"
      aria-hidden="true"
      style={{
        // Clear a deep, soft stage behind the hero headline: clouds fade out
        // as they drift into the text zone and back in as they leave. The
        // mask is static in screen space (the wrap itself never transforms),
        // so the stage holds steady while layers parallax/scroll inside it.
        // The fully-clear core covers the headline, subcopy, and CTAs with
        // margin; the long feather makes the transition imperceptible — no
        // visible ellipse edge, no snap at the boundary.
        WebkitMaskImage:
          "radial-gradient(ellipse 62% 44% at 50% 34%, transparent 55%, black 90%)",
        maskImage:
          "radial-gradient(ellipse 62% 44% at 50% 34%, transparent 55%, black 90%)",
      }}
    >
      {LAYERS.map((_, i) => (
        <div
          key={i}
          ref={(el) => {
            layerRefs.current[i] = el;
          }}
          className="absolute inset-0 will-change-transform"
        />
      ))}
    </div>
  );
}
