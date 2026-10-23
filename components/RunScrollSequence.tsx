"use client";

import { Children, useEffect, useRef, useState, type ReactNode } from "react";

export default function RunScrollSequence({
  children,
}: {
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  const [active, setActive] = useState(0);
  const scenes = Children.toArray(children);

  useEffect(() => {
    const element = root.current;
    const viewport = frame.current;
    if (!element || !viewport) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let request = 0;
    let enabled = false;

    const sync = () => {
      request = 0;
      const panels = [
        ...element.querySelectorAll<HTMLElement>(".run-scene-content"),
      ];
      // Short viewports and reduced motion get the complete, natural document flow.
      enabled =
        !reduced.matches &&
        panels.every((panel) => panel.offsetHeight <= window.innerHeight - 176);
      setPinned(enabled);
      const bounds = element.getBoundingClientRect();
      document.documentElement.toggleAttribute(
        "data-run-pinned",
        enabled && bounds.top <= 0 && bounds.bottom >= window.innerHeight,
      );
      if (!enabled) return;
      const distance = element.offsetHeight - viewport.offsetHeight;
      const progress =
        distance > 0
          ? Math.min(
              1,
              Math.max(0, -element.getBoundingClientRect().top / distance),
            )
          : 0;
      setActive(
        Math.min(panels.length - 1, Math.floor(progress * panels.length)),
      );
    };
    const schedule = () => {
      if (!request) request = requestAnimationFrame(sync);
    };
    const resize = new ResizeObserver(schedule);
    element
      .querySelectorAll(".run-scene-content")
      .forEach((panel) => resize.observe(panel));
    // The second layout pass measures the runway after pinning is enabled.
    resize.observe(element);
    sync();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    reduced.addEventListener("change", schedule);
    return () => {
      document.documentElement.removeAttribute("data-run-pinned");
      cancelAnimationFrame(request);
      resize.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      reduced.removeEventListener("change", schedule);
    };
  }, []);

  return (
    <div
      ref={root}
      data-ui="annotated-run"
      data-pinned={pinned || undefined}
      className="run-scroll-sequence"
    >
      <div
        ref={frame}
        className="run-pinned-frame"
        role="region"
        aria-label="Sample run: scroll through browser, evidence, diagnosis and fix"
        tabIndex={pinned ? 0 : undefined}
      >
        {scenes.map((scene, index) => (
          <div
            key={index}
            className="run-scene"
            data-active={active === index || undefined}
            aria-hidden={pinned && active !== index ? true : undefined}
            inert={pinned && active !== index}
          >
            <div className="run-scene-content">{scene}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
