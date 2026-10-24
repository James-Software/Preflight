"use client";

import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import AgentOverview, {
  BROWSER_FINDING,
  PR_FINDING,
  type AgentPointer,
} from "./AgentOverview";

export default function RunScrollSequence({
  children,
}: {
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const pointer = useRef<AgentPointer | null>(null);
  const [pinned, setPinned] = useState(false);
  const [active, setActive] = useState(0);
  const [finding, setFinding] = useState<number | null>(null);
  const scenes = Children.toArray(children);

  useEffect(() => {
    const element = root.current;
    const viewport = frame.current;
    if (!element || !viewport) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let request = 0;
    let enabled = false;
    let snapTimer: ReturnType<typeof setTimeout> | undefined;
    let pointerDown = false;
    let touching = false;
    const beats = [
      ...element.querySelectorAll<HTMLElement>(".run-scene-content"),
    ].map((panel) =>
      Number(panel.firstElementChild?.getAttribute("data-scroll-beats") || 1),
    );
    const totalBeats = beats.reduce((sum, count) => sum + count, 0);
    const anchors: number[] = [];
    let start = 0;
    beats.forEach((count) => {
      for (let step = 0; step < count; step++)
        anchors.push(start + (count > 1 && step === 0 ? 0.8 : step + 0.5));
      start += count;
    });
    // The opening and closing scenes also serve as the natural entry/exit points.
    anchors[0] = 0;
    anchors[anchors.length - 1] = totalBeats;
    const nearestAnchor = (phase: number) =>
      anchors.reduce(
        (best, value, index) =>
          Math.abs(value - phase) < Math.abs(anchors[best] - phase)
            ? index
            : best,
        0,
      );
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
      const inAnimation =
        enabled && bounds.top <= 0 && bounds.bottom >= window.innerHeight;
      document.documentElement.toggleAttribute("data-run-pinned", inAnimation);
      if (!enabled) {
        setFinding(null);
        cards.forEach((card) => {
          card.removeAttribute("aria-hidden");
          card.inert = false;
        });
        return;
      }
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
        setFinding(
          !inAnimation
            ? null
            : next === 0
              ? BROWSER_FINDING
              : next === beats.length - 1
                ? PR_FINDING
                : next === fanScene && front >= 0
                  ? front
                  : null,
        );
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
          // The parked edge previews are decorative until their own scroll beat.
          card.setAttribute("aria-hidden", String(parked));
          card.inert = parked;
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
    const cancelSnap = () => clearTimeout(snapTimer);
    const snap = () => {
      if (
        !enabled ||
        reduced.matches ||
        pointerDown ||
        touching ||
        window.getSelection()?.toString()
      )
        return;
      const bounds = element.getBoundingClientRect();
      const travel = element.offsetHeight - viewport.offsetHeight;
      if (bounds.top > 0 || bounds.bottom < window.innerHeight || travel <= 0)
        return;
      const index = nearestAnchor((-bounds.top / travel) * totalBeats);
      const target =
        window.scrollY + bounds.top + (travel * anchors[index]) / totalBeats;
      // Only settle when already close to a center. Never pull across a scene.
      const gap = Math.abs(target - window.scrollY);
      if (gap >= 4 && gap <= Math.min(80, window.innerHeight * 0.1)) {
        // The stage is already centered here. Avoid a smooth page-scroll tween
        // that could intercept the next wheel event while it is running.
        window.scrollTo({
          top:
            index === 0
              ? Math.ceil(target)
              : index === anchors.length - 1
                ? Math.floor(target)
                : target,
          behavior: "instant",
        });
      }
    };
    const interruptSnap = cancelSnap;
    const armSnap = () => {
      clearTimeout(snapTimer);
      if (!pointerDown && !touching) snapTimer = setTimeout(snap, 260);
    };
    const schedule = () => {
      if (!request) request = requestAnimationFrame(sync);
      armSnap();
    };
    const touchStart = () => {
      touching = true;
      interruptSnap();
    };
    const touchStop = (event: TouchEvent) => {
      touching = event.type !== "touchcancel" && event.touches.length > 0;
      armSnap();
    };
    const rememberPointer = (event: PointerEvent) => {
      if (event.pointerType !== "touch")
        pointer.current = { x: event.clientX, y: event.clientY };
    };
    const press = () => {
      pointerDown = true;
      interruptSnap();
    };
    const release = () => {
      pointerDown = false;
      armSnap();
    };
    const key = (event: KeyboardEvent) => {
      if (
        [
          "ArrowDown",
          "ArrowUp",
          "PageDown",
          "PageUp",
          "Home",
          "End",
          " ",
        ].includes(event.key)
      )
        interruptSnap();
    };
    const resize = new ResizeObserver(schedule);
    element
      .querySelectorAll(".run-scene-content")
      .forEach((panel) => resize.observe(panel));
    // The second layout pass measures the runway after pinning is enabled.
    resize.observe(element);
    sync();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("pointermove", rememberPointer, { passive: true });
    window.addEventListener("pointerdown", press, { passive: true });
    window.addEventListener("pointerup", release, { passive: true });
    window.addEventListener("pointercancel", release, { passive: true });
    // Native wheel, keyboard and touch scrolling stay in control of the page.
    window.addEventListener("wheel", interruptSnap, { passive: true });
    window.addEventListener("touchstart", touchStart, { passive: true });
    window.addEventListener("touchend", touchStop, { passive: true });
    window.addEventListener("touchcancel", touchStop, { passive: true });
    window.addEventListener("keydown", key);
    window.addEventListener("resize", schedule);
    reduced.addEventListener("change", schedule);
    return () => {
      document.documentElement.removeAttribute("data-run-pinned");
      cancelSnap();
      cancelAnimationFrame(request);
      window.removeEventListener("pointermove", rememberPointer);
      window.removeEventListener("pointerdown", press);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("wheel", interruptSnap);
      window.removeEventListener("touchstart", touchStart);
      window.removeEventListener("touchend", touchStop);
      window.removeEventListener("touchcancel", touchStop);
      window.removeEventListener("keydown", key);
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
        {pinned && finding !== null && (
          <AgentOverview key={finding} finding={finding} pointer={pointer} />
        )}
      </div>
    </div>
  );
}
