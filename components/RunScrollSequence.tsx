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
    const beats = [
      ...element.querySelectorAll<HTMLElement>(".run-scene-content"),
    ].map((panel) =>
      Number(panel.firstElementChild?.getAttribute("data-scroll-beats") || 1),
    );
    const totalBeats = beats.reduce((sum, count) => sum + count, 0);
    const fan = element.querySelector<HTMLElement>("[data-evidence-fan]");
    const cards = fan
      ? [...fan.querySelectorAll<HTMLElement>("[data-evidence-card]")]
      : [];
    const fanScene = [
      ...element.querySelectorAll(".run-scene-content"),
    ].findIndex((panel) => panel.contains(fan));
    const fanStart = beats
      .slice(0, fanScene)
      .reduce((sum, count) => sum + count, 0);

    const sync = () => {
      request = 0;
      const panels = [
        ...element.querySelectorAll<HTMLElement>(".run-scene-content"),
      ];
      // Short viewports and reduced motion get the complete, natural document flow.
      enabled =
        !reduced.matches &&
        panels.every((panel) => {
          const evidence = panel.querySelector<HTMLElement>(
            "[data-evidence-fan]",
          );
          const height = evidence
            ? panel.offsetHeight - evidence.offsetHeight + 440
            : panel.offsetHeight;
          return height <= window.innerHeight - 176;
        });
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
      const phase = progress * totalBeats;
      let next = 0;
      let end = beats[0];
      while (next < beats.length - 1 && phase >= end) end += beats[++next];
      setActive(next);
      if (fan && cards.length) {
        const local = Math.max(0, Math.min(4, phase - fanStart));
        const open = Math.min(1, local / 0.7);
        const front = local < 1 ? -1 : Math.min(2, Math.floor(local - 1));
        fan.dataset.front = String(front);
        const cardWidth = Math.min(260, fan.clientWidth * 0.7);
        const cardHeight = cardWidth * 1.4;
        const spread = Math.max(
          12,
          (fan.clientWidth - (cardWidth * 0.982 + cardHeight * 0.191) * 0.88) /
            2 -
            6,
        );
        const captionHeight =
          fan.closest<HTMLElement>(".run-scene-content")!.offsetHeight -
          fan.offsetHeight;
        const availableWidth = window.innerWidth - 48;
        const availableHeight = window.innerHeight - 64;
        const browserWidth = Math.min(960, availableWidth);
        const compact = availableWidth < 520;
        const windows = [
          {
            width: browserWidth,
            height: Math.min(
              availableHeight,
              Math.max(440, browserWidth * 0.625),
            ),
          },
          {
            width: Math.min(640, availableWidth),
            height: Math.min(availableHeight, compact ? 360 : 300),
          },
          {
            width: Math.min(720, availableWidth),
            height: Math.min(availableHeight, compact ? 420 : 360),
          },
        ];
        cards.forEach((card, index) => {
          // Screenshot starts in the middle and stays there for its first expansion.
          let side = [0, -1, 1][index];
          if (front >= 0)
            side =
              index === front ? 0 : index === (front === 0 ? 1 : 0) ? -1 : 1;
          const focused = index === front;
          card.dataset.front = String(focused);
          const parked = front >= 0 && !focused;
          const x = parked
            ? side * (window.innerWidth / 2 + cardWidth * 0.12)
            : side * spread * open;
          card.style.setProperty(
            "--card-width",
            `${focused ? windows[index].width : cardWidth}px`,
          );
          card.style.setProperty(
            "--card-height",
            `${focused ? windows[index].height : cardHeight}px`,
          );
          card.style.setProperty("--card-x", `${x}px`);
          card.style.setProperty("--card-rotate", `${side * 11 * open}deg`);
          card.style.setProperty("--card-scale", String(focused ? 1 : 0.88));
          card.style.setProperty(
            "--card-y",
            `${focused ? -captionHeight / 2 : 14}px`,
          );
          card.style.zIndex = String(focused ? 4 : index === 0 ? 3 : 1);
        });
      }
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
