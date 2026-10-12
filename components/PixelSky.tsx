"use client";

import { useCallback, useEffect, useRef } from "react";
import DitherClouds from "./DitherClouds";
import PixelPlane, { planeFlight } from "./PixelPlane";

const TRAIL_DOTS = 14;

interface PixelSkyProps {
  heroRef: React.RefObject<HTMLElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * The takeoff scene. Scroll is the throttle: as the user scrolls down the
 * hero, the pixel plane climbs along an arc with a dotted pixel contrail,
 * the dithered cloudscape sinks past with parallax, and the hero copy
 * gently lifts away. Reduced-motion users get a static sky and a plane on
 * the runway. The clouds add their own mouse parallax + ambient drift
 * (handled inside DitherClouds) — atmosphere only, never the focal moment.
 */
export default function PixelSky({ heroRef, contentRef }: PixelSkyProps) {
  const planeRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  const scrollP = useRef(0);

  const getScrollP = useCallback(() => scrollP.current, []);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const place = (p: number) => {
      scrollP.current = p;
      const w = hero.offsetWidth;
      const h = hero.offsetHeight;
      const plane = planeRef.current;
      if (plane) {
        const { x, y, scale } = planeFlight(p);
        plane.style.transform = `translate(${(x / 100) * w}px, ${(y / 100) * h}px) translate(-50%, -50%) scale(${scale.toFixed(4)})`;
      }
      const trail = trailRef.current;
      if (trail) {
        const kids = trail.children;
        for (let i = 0; i < kids.length; i++) {
          const t = p - (i + 1) * 0.045;
          const el = kids[i] as HTMLElement;
          if (t > 0.005) {
            const pt = planeFlight(t);
            el.style.opacity = String(0.7 * (1 - i / kids.length));
            el.style.transform = `translate(${(pt.x / 100) * w}px, ${(pt.y / 100) * h}px) translate(-50%, -50%)`;
          } else {
            el.style.opacity = "0";
          }
        }
      }
      const content = contentRef.current;
      if (content) {
        // The copy lifts gently with scroll but never fades out.
        content.style.transform = `translate3d(0, ${p * -48}px, 0)`;
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
    <div className="absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
      <DitherClouds getScrollP={getScrollP} />

      {/* soft edge fades: clouds dissolve into the white sky instead of
          hard-clipping at the viewport edges. Above the clouds (z-0),
          below the plane (z-10). Static divs — clouds drift beneath them,
          so exiting clouds gracefully fade out instead of snapping. */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-[12%] bg-gradient-to-r from-white via-white/70 to-transparent"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-[12%] bg-gradient-to-l from-white via-white/70 to-transparent"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-[10%] bg-gradient-to-b from-white via-white/70 to-transparent"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-[18%] bg-gradient-to-t from-white via-white/60 to-transparent"
        aria-hidden="true"
      />

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
            className="absolute block h-[5px] w-[5px] rounded-[1px] bg-[#8b7cf6]"
            style={{ opacity: 0 }}
          />
        ))}
      </div>

      {/* the plane: pixel-art sprite, scroll-driven takeoff */}
      <div
        ref={planeRef}
        className="absolute left-0 top-0 z-10 will-change-transform"
        style={{ transform: "translate(8vw, 74vh) translate(-50%, -50%)" }}
      >
        <PixelPlane getScrollP={getScrollP} />
      </div>
    </div>
  );
}
