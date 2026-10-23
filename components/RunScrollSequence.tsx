"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BranchIcon } from "./GitIcons";

const STAGES = ["Browser", "Evidence", "Diagnosis", "Review"];

export default function RunScrollSequence({
  children,
}: {
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const rows = [...element.querySelectorAll<HTMLElement>(".run-row")];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const animations = new Set<Animation>();
    const seen = new WeakSet<Element>();
    let frame = 0;

    // Animate only on entry: the underlying server-rendered content is always visible.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || seen.has(entry.target)) continue;
          seen.add(entry.target);
          observer.unobserve(entry.target);
          if (reduced.matches) continue;
          const target = entry.target;
          const animation = target.animate(
            [
              { opacity: 0.2, transform: "translateY(28px)" },
              { opacity: 1, transform: "translateY(0)" },
            ],
            {
              duration: 650,
              delay: target.matches(".run-annotation") ? 130 : 0,
              easing: "cubic-bezier(0.16, 1, 0.3, 1)",
              fill: "backwards",
            },
          );
          animations.add(animation);
          animation.onfinish = () => animations.delete(animation);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    element
      .querySelectorAll(".run-pane, .run-annotation")
      .forEach((target) => observer.observe(target));
    const intro = element.parentElement?.querySelector(".run-intro");
    if (intro) observer.observe(intro);
    const payoff = element.querySelector(".run-pr");
    if (payoff) observer.observe(payoff);

    const sync = () => {
      frame = 0;
      const start = rows[0].getBoundingClientRect().top;
      const end = rows[rows.length - 1].getBoundingClientRect().bottom;
      const guide = window.innerHeight * 0.55;
      const progress = Math.min(
        1,
        Math.max(0, (guide - start) / (end - start)),
      );
      element.style.setProperty("--run-progress", String(progress));
      let current = 0;
      rows.forEach((row, index) => {
        if (row.getBoundingClientRect().top <= guide) current = index;
      });
      setStage((previous) => (previous === current ? previous : current));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(sync);
    };
    const onMotionChange = () => {
      if (reduced.matches) {
        animations.forEach((animation) => animation.cancel());
        animations.clear();
      }
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(element);
    sync();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    reduced.addEventListener("change", onMotionChange);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
      animations.forEach((animation) => animation.cancel());
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      reduced.removeEventListener("change", onMotionChange);
    };
  }, []);

  return (
    <div ref={root} data-ui="annotated-run" className="run-artifact">
      <header className="run-header run-scroll-header">
        <div className="run-header-details">
          <p className="text-lg font-semibold">Run #128</p>
          <span className="run-branch">
            <BranchIcon />
            main
          </span>
          <p className="text-sm">3 agents · 47 steps · 1 finding</p>
        </div>
        <ol className="run-stages" aria-label="Sample run stages">
          {STAGES.map((label, index) => (
            <li
              key={label}
              aria-current={stage === index ? "step" : undefined}
              data-complete={index < stage}
            >
              <span className="run-stage-dot" aria-hidden="true" />
              {label}
            </li>
          ))}
        </ol>
        <div className="run-scroll-track" aria-hidden="true">
          <span />
        </div>
      </header>
      {children}
    </div>
  );
}
