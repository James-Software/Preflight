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
      if (d < 0.12) continue;
      if (rand() > Math.min(1, d * 1.02)) continue;
      ctx.fillStyle = ramp(d, rand);
      ctx.fillRect(gx * DOT, gy * DOT, DOT, DOT);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Cloudscape: 3 depth layers, mouse parallax + ambient drift          */
/* ------------------------------------------------------------------ */

interface CloudSpec {
  x: number; // center, fraction of hero width
  y: number; // center, fraction of hero height
  w: number; // width px at 1440px reference
  seed: number;
}

interface LayerSpec {
  clouds: CloudSpec[];
  mouse: number; // max px of mouse parallax
  scroll: number; // px of downward drift over the takeoff
  period: number; // seconds per ambient drift cycle
  amp: number; // px of ambient drift
  phase: number;
}

const LAYERS: LayerSpec[] = [
  {
    clouds: [
      { x: 0.1, y: 0.15, w: 640, seed: 1103 },
      { x: 0.82, y: 0.11, w: 720, seed: 2207 },
      { x: 0.52, y: 0.05, w: 470, seed: 3311 },
    ],
    mouse: 10,
    scroll: 30,
    period: 105,
    amp: 26,
    phase: 0.4,
  },
  {
    clouds: [
      { x: 0.04, y: 0.44, w: 560, seed: 4417 },
      { x: 0.92, y: 0.46, w: 620, seed: 5523 },
      { x: 0.66, y: 0.68, w: 430, seed: 6629 },
    ],
    mouse: 22,
    scroll: 60,
    period: 82,
    amp: 20,
    phase: 2.1,
  },
  {
    clouds: [
      { x: 0.12, y: 0.9, w: 680, seed: 7731 },
      { x: 0.86, y: 0.86, w: 600, seed: 8837 },
    ],
    mouse: 38,
    scroll: 95,
    period: 64,
    amp: 15,
    phase: 4.4,
  },
];

interface DitherCloudsProps {
  /** 0..1 scroll progress of the takeoff, owned by PixelSky */
  getScrollP: () => number;
}

export default function DitherClouds({ getScrollP }: DitherCloudsProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const layerRefs = useRef<(HTMLDivElement | null)[]>([]);

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
      const s = Math.max(0.72, Math.min(1.15, w / 1440));

      LAYERS.forEach((layer, li) => {
        const host = layerRefs.current[li];
        if (!host) return;
        host.innerHTML = "";
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.display = "block";
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.scale(dpr, dpr);

        for (const c of layer.clouds) {
          const cw = Math.ceil(c.w * s);
          const ch = Math.ceil(cw * 0.42);
          const cc = document.createElement("canvas");
          cc.width = Math.ceil(cw * dpr);
          cc.height = Math.ceil(ch * dpr);
          const cctx = cc.getContext("2d");
          if (!cctx) continue;
          cctx.scale(dpr, dpr);
          stampCloud(cctx, cw, ch, c.seed);
          ctx.drawImage(cc, c.x * w - cw / 2, c.y * h - ch / 2, cw, ch);
        }
        host.appendChild(canvas);
      });
    };

    const place = (
      mx: number,
      my: number,
      t: number,
      animate: boolean,
    ) => {
      const p = getScrollP();
      LAYERS.forEach((layer, li) => {
        const el = layerRefs.current[li];
        if (!el) return;
        const dx = animate
          ? mx * layer.mouse +
            Math.sin((t * 2 * Math.PI) / layer.period + layer.phase) *
              layer.amp
          : 0;
        const dy = animate
          ? my * layer.mouse * 0.45 +
            Math.sin(
              (t * 2 * Math.PI) / (layer.period * 1.7) + layer.phase * 2,
            ) *
              layer.amp *
              0.45 +
            p * layer.scroll
          : p * layer.scroll;
        el.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0)`;
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

    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      mx += (tmx - mx) * 0.055;
      my += (tmy - my) * 0.055;
      place(mx, my, (now - start) / 1000, true);
      raf = requestAnimationFrame(tick);
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
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("resize", onResize);
      clearTimeout(rT);
    };
  }, [getScrollP]);

  return (
    <div
      ref={wrapRef}
      className="pointer-events-none absolute inset-0"
      aria-hidden="true"
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
