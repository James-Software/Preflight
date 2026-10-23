"use client";

import { useState } from "react";

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

export default function AgentOverview({ finding }: { finding: number }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  const issue = FINDINGS[finding];
  return (
    <aside
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
