"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

export type AgentPointer = { x: number; y: number };

export const BROWSER_FINDING = 3;
export const PR_FINDING = 4;

type Finding = {
  source: string;
  title: string;
  description: string;
  complete?: boolean;
};
const FINDINGS: Finding[] = [
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
  {
    source: "Browser",
    title: "Reproduced the checkout bug",
    description:
      "Selected Pro and clicked Pay now. The page stayed idle, so I’m collecting the evidence.",
  },
  {
    source: "Pull request",
    title: "Fix ready for your review",
    description:
      "Updated the handler to use the current plan and attached the evidence.",
    complete: true,
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
    const position = () => {
      frame = 0;
      if (!pointer.current) return;
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
      if (event instanceof PointerEvent && event.pointerType === "touch")
        return;
      if (!frame) frame = requestAnimationFrame(position);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDismissed(true);
    };
    window.addEventListener("keydown", dismissOnEscape);
    position();
    const resize = new ResizeObserver(() => schedule());
    resize.observe(element);
    window.addEventListener("pointermove", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", dismissOnEscape);
      resize.disconnect();
      window.removeEventListener("pointermove", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [dismissed, pointer]);
  if (dismissed) return null;
  const issue = FINDINGS[finding];
  return (
    <aside
      ref={popup}
      className="agent-overview"
      data-complete={issue.complete || undefined}
      aria-label={`${issue.source} agent overview`}
    >
      <div className="agent-overview-header">
        <div className="agent-overview-avatar">
          {/* A vector rendition of the supplied robot reference. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/agent-robot.svg"
            width="36"
            height="36"
            alt=""
            aria-hidden="true"
          />
          {issue.complete && (
            <span className="agent-completed-badge" aria-hidden="true">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m5 12 4 4 10-10" />
              </svg>
            </span>
          )}
        </div>
        <div>
          <p className="agent-overview-name">PreFlight agent</p>
          <p className="agent-overview-source">
            {issue.source} · sample {issue.complete ? "action" : "finding"}
          </p>
        </div>
      </div>
      <div className="agent-overview-finding" role="status" aria-live="polite">
        <h4>{issue.title}</h4>
        <p>{issue.description}</p>
        {issue.complete && (
          <div className="agent-opened-pr">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="6" cy="5" r="3" />
              <circle cx="6" cy="19" r="3" />
              <circle cx="18" cy="19" r="3" />
              <path d="M6 8v8M18 16V8a3 3 0 0 0-3-3h-3m3-3-3 3 3 3" />
            </svg>
            <div>
              <strong>Opened PR</strong>
              <span>#436 · awaiting your merge</span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
