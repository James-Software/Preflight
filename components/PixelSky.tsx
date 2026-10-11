"use client";

import { useEffect, useRef } from "react";
import {
  PixelSprite,
  PLANE_MAP,
  PLANE_PALETTE,
  CLOUD_A,
  CLOUD_B,
  CLOUD_PALETTE,
} from "./pixel-art";

const TRAIL_DOTS = 14;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Plane path in % of hero width/height. Gentle accelerating climb, nose-up. */
function planePath(t: number) {
  const x = lerp(8, 70, t);
  const y = 66 - 54 * Math.pow(t, 1.5);
  const rot = -12 * Math.sin((Math.PI / 2) * t);
  return { x, y, rot };
}

interface CloudCfg {
  map: string[];
  width: number;
  left: string;
  top: string;
  drift: number; // seconds per drift cycle
  parallax: number; // px of downward drift over the takeoff
}

const CLOUDS: CloudCfg[] = [
  { map: CLOUD_A, width: 340, left: "3%", top: "14%", drift: 52, parallax: 26 },
  { map: CLOUD_B, width: 210, left: "64%", top: "26%", drift: 36, parallax: 52 },
  { map: CLOUD_A, width: 250, left: "40%", top: "50%", drift: 62, parallax: 16 },
  { map: CLOUD_B, width: 170, left: "82%", top: "60%", drift: 30, parallax: 68 },
  { map: CLOUD_A, width: 150, left: "24%", top: "76%", drift: 44, parallax: 40 },
];

interface PixelSkyProps {
  heroRef: React.RefObject<HTMLElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * The takeoff scene. Scroll is the throttle: as the user scrolls down the
 * hero, the pixel plane climbs along an arc with a dotted pixel contrail,
 * clouds sink past with parallax, and the hero copy gently lifts away.
 * Reduced-motion users get a static plane on the runway. No motion otherwise.
 */
export default function PixelSky({ heroRef, contentRef }: PixelSkyProps) {
  const planeRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  const cloudRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const place = (p: number) => {
      const w = hero.offsetWidth;
      const h = hero.offsetHeight;
      const plane = planeRef.current;
      if (plane) {
        const { x, y, rot } = planePath(p);
        plane.style.transform = `translate(${(x / 100) * w}px, ${(y / 100) * h}px) translate(-50%, -50%) rotate(${rot}deg)`;
      }
      const trail = trailRef.current;
      if (trail) {
        const kids = trail.children;
        for (let i = 0; i < kids.length; i++) {
          const t = p - (i + 1) * 0.045;
          const el = kids[i] as HTMLElement;
          if (t > 0.005) {
            const pt = planePath(t);
            el.style.opacity = String(0.7 * (1 - i / kids.length));
            el.style.transform = `translate(${(pt.x / 100) * w}px, ${(pt.y / 100) * h}px) translate(-50%, -50%)`;
          } else {
            el.style.opacity = "0";
          }
        }
      }
      cloudRefs.current.forEach((c, i) => {
        if (c)
          c.style.transform = `translate3d(0, ${p * CLOUDS[i].parallax}px, 0)`;
      });
      const content = contentRef.current;
      if (content) {
        content.style.transform = `translate3d(0, ${p * -48}px, 0)`;
        content.style.opacity = String(Math.max(0, 1 - p * 0.9));
      }
    };

    place(0);
    if (reduced) return;

    let ticking = false;
    let lastY = -1;
    const update = () => {
      ticking = false;
      const y = window.scrollY;
      if (y === lastY) return;
      lastY = y;
      const total = Math.max(1, hero.offsetHeight - window.innerHeight * 0.4);
      place(Math.min(1, Math.max(0, y / total)));
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [heroRef, contentRef]);

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {CLOUDS.map((c, i) => (
        <div
          key={i}
          ref={(el) => {
            cloudRefs.current[i] = el;
          }}
          className="absolute will-change-transform"
          style={{ left: c.left, top: c.top }}
        >
          <div
            className="cloud-drift"
            style={{ animationDuration: `${c.drift}s` }}
          >
            <PixelSprite
              map={c.map}
              palette={CLOUD_PALETTE}
              pixel={c.width / c.map[0].length}
            />
          </div>
        </div>
      ))}

      {/* runway dashes where the plane starts */}
      <div className="absolute" style={{ left: "5%", top: "73%" }}>
        <div className="flex gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <span
              key={i}
              className="block h-1 w-4 rounded-[1px] bg-mist"
            />
          ))}
        </div>
      </div>

      {/* dotted pixel contrail */}
      <div ref={trailRef} className="absolute left-0 top-0">
        {Array.from({ length: TRAIL_DOTS }).map((_, i) => (
          <span
            key={i}
            className="absolute block h-[5px] w-[5px] rounded-[1px] bg-[#A5B4FC]"
            style={{ opacity: 0 }}
          />
        ))}
      </div>

      {/* the plane */}
      <div
        ref={planeRef}
        className="absolute left-0 top-0 will-change-transform"
        style={{ transform: "translate(8vw, 74vh) translate(-50%, -50%)" }}
      >
        <PixelSprite map={PLANE_MAP} palette={PLANE_PALETTE} pixel={6} />
      </div>
    </div>
  );
}
