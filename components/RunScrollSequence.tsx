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
    let snapRelease: ReturnType<typeof setTimeout> | undefined;
    let snapping = false;
    let pointerDown = false;
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
    const cancelSnap = () => {
      clearTimeout(snapTimer);
      clearTimeout(snapRelease);
      snapping = false;
    };
    const snap = () => {
      if (
        !enabled ||
        reduced.matches ||
        pointerDown ||
        window.getSelection()?.toString()
      )
        return;
      const bounds = element.getBoundingClientRect();
      const travel = element.offsetHeight - viewport.offsetHeight;
      // Snap only inside the pinned animation, leaving entry and exit in normal flow.
      if (bounds.top > 0 || bounds.bottom < window.innerHeight || travel <= 0)
        return;
      const progress = -bounds.top / travel;
      if (progress <= 0.005 || progress >= 0.995) return;
      const anchors = [0, totalBeats];
      let start = 0;
      beats.forEach((count) => {
        if (count === 1) anchors.push(start + 0.5);
        else
          for (let step = 0; step < count; step++)
            anchors.push(start + (step === 0 ? 0.8 : step + 0.5));
        start += count;
      });
      const phase = progress * totalBeats;
      const nearest = anchors.reduce((best, value) =>
        Math.abs(value - phase) < Math.abs(best - phase) ? value : best,
      );
      const target =
        window.scrollY + bounds.top + (travel * nearest) / totalBeats;
      if (Math.abs(target - window.scrollY) < 4) return;
      snapping = true;
      window.scrollTo({ top: target, behavior: "smooth" });
      snapRelease = setTimeout(() => {
        snapping = false;
      }, 1200);
    };
    const armSnap = () => {
      clearTimeout(snapTimer);
      if (!snapping && !pointerDown) snapTimer = setTimeout(snap, 200);
    };
    const schedule = () => {
      if (!request) request = requestAnimationFrame(sync);
      armSnap();
    };
    const rememberPointer = (event: PointerEvent) => {
      if (event.pointerType !== "touch")
        pointer.current = { x: event.clientX, y: event.clientY };
    };
    const press = () => {
      pointerDown = true;
      cancelSnap();
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
        cancelSnap();
    };
    const scrollEnd = () => {
      if (snapping) {
        clearTimeout(snapRelease);
        snapping = false;
      }
    };
    const resize = new ResizeObserver(schedule);
    element
      .querySelectorAll(".run-scene-content")
      .forEach((panel) => resize.observe(panel));
    // The second layout pass measures the runway after pinning is enabled.
    resize.observe(element);
    sync();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("scrollend", scrollEnd);
    window.addEventListener("pointermove", rememberPointer, { passive: true });
    window.addEventListener("pointerdown", press, { passive: true });
    window.addEventListener("pointerup", release, { passive: true });
    window.addEventListener("pointercancel", release, { passive: true });
    window.addEventListener("wheel", cancelSnap, { passive: true });
    window.addEventListener("touchstart", cancelSnap, { passive: true });
    window.addEventListener("keydown", key);
    window.addEventListener("resize", schedule);
    reduced.addEventListener("change", schedule);
    return () => {
      document.documentElement.removeAttribute("data-run-pinned");
      cancelSnap();
      cancelAnimationFrame(request);
      window.removeEventListener("scrollend", scrollEnd);
      window.removeEventListener("pointermove", rememberPointer);
      window.removeEventListener("pointerdown", press);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("wheel", cancelSnap);
      window.removeEventListener("touchstart", cancelSnap);
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
