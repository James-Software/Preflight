"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

export type AgentPointer = { x: number; y: number };

const FINDINGS = [
  {
    source: "Screenshot",
    title: "Checkout stalled",
    description:
      "Pro is selected. Three clicks on Pay now, and the page still hasn’t responded.",
  },
  {
    source: "Console",
    title: "The handler lost the plan",
    description:
      "The click throws because plan is null at page.tsx:89. Payment never starts.",
  },
  {
    source: "Network",
    title: "Nothing reached the server",
    description:
      "No POST /api/checkout was sent. The handler failed before the request could leave the browser.",
  },
];

export default function AgentOverview({
  finding,
  pointer,
}: {
  finding: number;
  pointer: RefObject<AgentPointer | null>;
}) {
  const [dismissed, setDismissed] = useState(false);
  const popup = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = popup.current;
    if (!element || dismissed) return;
    let frame = 0;
    let hovered = false;
    const position = () => {
      frame = 0;
      if (
        !pointer.current ||
        hovered ||
        element.contains(document.activeElement)
      )
        return;
      const { x, y } = pointer.current;
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      const parent = (
        element.offsetParent as HTMLElement
      ).getBoundingClientRect();
      const left = Math.min(
        Math.max(12, x + 16),
        window.innerWidth - width - 12,
      );
      const above = y - height - 16;
      const top = Math.max(
        12,
        Math.min(
          window.innerHeight - height - 12,
          above >= 12 ? above : y + 16,
        ),
      );
      element.dataset.anchor = "cursor";
      element.style.left = `${left - parent.left}px`;
      element.style.top = `${top - parent.top}px`;
    };
    const schedule = (event?: Event) => {
      if (
        (event instanceof PointerEvent && event.pointerType === "touch") ||
        (event?.target instanceof Node && element.contains(event.target))
      )
        return;
      if (!frame) frame = requestAnimationFrame(position);
    };
    const freeze = () => {
      hovered = true;
      cancelAnimationFrame(frame);
      frame = 0;
      if (element.dataset.anchor !== "cursor") return;
      const bounds = element.getBoundingClientRect();
      const parent = (
        element.offsetParent as HTMLElement
      ).getBoundingClientRect();
      element.dataset.held = "true";
      element.style.left = `${bounds.left - parent.left}px`;
      element.style.top = `${bounds.top - parent.top}px`;
    };
    const resume = () => {
      hovered = false;
      delete element.dataset.held;
      schedule();
    };
    position();
    const resize = new ResizeObserver(() => schedule());
    resize.observe(element);
    window.addEventListener("pointermove", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    element.addEventListener("pointerenter", freeze);
    element.addEventListener("pointerleave", resume);
    element.addEventListener("focusin", freeze);
    element.addEventListener("focusout", resume);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener("pointermove", schedule);
      window.removeEventListener("resize", schedule);
      element.removeEventListener("pointerenter", freeze);
      element.removeEventListener("pointerleave", resume);
      element.removeEventListener("focusin", freeze);
      element.removeEventListener("focusout", resume);
    };
  }, [dismissed, pointer]);
  if (dismissed) return null;
  const issue = FINDINGS[finding];
  return (
    <aside
      ref={popup}
      className="agent-overview"
      aria-label={`${issue.source} agent overview`}
    >
      <div className="agent-overview-header">
        {/* A vector rendition of the supplied robot reference, rather than a remote asset. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/agent-robot.svg"
          width="36"
          height="36"
          alt=""
          aria-hidden="true"
        />
        <div>
          <p className="agent-overview-name">PreFlight agent</p>
          <p className="agent-overview-source">
            {issue.source} · sample finding
          </p>
        </div>
        <button
          type="button"
          aria-label="Dismiss agent overview"
          onClick={() => setDismissed(true)}
          className="agent-overview-dismiss"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            aria-hidden="true"
          >
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <div className="agent-overview-finding" role="status" aria-live="polite">
        <h4>{issue.title}</h4>
        <p>{issue.description}</p>
      </div>
    </aside>
  );
}
