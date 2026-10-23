"use client";

import { useId, useRef, useState } from "react";
import { LogBlock } from "./SampleRunBlocks";

const TABS = ["Screenshot", "Console", "Network"] as const;

export function CheckoutSnapshot() {
  return (
    <div
      className="sample-checkout"
      role="img"
      aria-label="Agent-2 screenshot of checkout: Pro selected, Pay now clicked, no response"
    >
      <div className="sample-browser-tabs" aria-hidden="true">
        <span className="sample-window-controls">
          <i />
          <i />
          <i />
        </span>
        <span className="sample-browser-tab">
          <span className="sample-tab-favicon" />
          Checkout<span className="ml-auto">×</span>
        </span>
        <span className="sample-new-tab">+</span>
      </div>
      <div className="sample-browser-toolbar" aria-hidden="true">
        <span className="sample-browser-navigation">
          <svg viewBox="0 0 24 24">
            <path d="m12 5-7 7 7 7M5 12h14" />
          </svg>
          <svg viewBox="0 0 24 24">
            <path d="m12 5 7 7-7 7M5 12h14" />
          </svg>
          <svg viewBox="0 0 24 24">
            <path d="M20 7v5h-5M19 12a7 7 0 1 0-2 5" />
          </svg>
        </span>
        <span className="sample-address-bar">
          <svg viewBox="0 0 24 24">
            <path d="M4 8h16M4 16h16" />
            <circle cx="9" cy="8" r="2" />
            <circle cx="15" cy="16" r="2" />
          </svg>
          <span>
            demo.example<span className="sample-address-path">/checkout</span>
          </span>
        </span>
        <svg className="sample-browser-menu" viewBox="0 0 24 24">
          <circle cx="12" cy="5" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="12" cy="19" r="1" />
        </svg>
      </div>
      <div className="sample-checkout-body">
        <div className="sample-store-brand">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="sample-store-icon"
          >
            <path d="m12 2 10 10-10 10L2 12Z" fill="currentColor" />
            <path d="M6 12h12M12 6v12" stroke="var(--surface)" />
          </svg>{" "}
          Example store{" "}
          <span className="ml-auto text-xs font-normal">Secure checkout</span>
        </div>
        <p className="mt-6 text-sm">Your subscription</p>
        <p className="mt-2 text-2xl font-semibold">
          Pro <span className="text-sm font-normal">plan selected</span>
        </p>
        <div className="sample-pay">
          Pay now{" "}
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="sample-pay-arrow"
          >
            <path d="M5 12h14m-6-6 6 6-6 6" />
          </svg>
        </div>
        <p className="mt-3 text-sm">Clicked. No response.</p>
      </div>
    </div>
  );
}

export default function RunEvidence() {
  const id = useId();
  const [active, setActive] = useState(1);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div>
      <div
        role="tablist"
        aria-label="Evidence from agent-2"
        className="run-tabs"
      >
        {TABS.map((tab, index) => (
          <button
            key={tab}
            ref={(el) => {
              refs.current[index] = el;
            }}
            id={`${id}-tab-${index}`}
            type="button"
            role="tab"
            aria-selected={active === index}
            aria-controls={`${id}-panel-${index}`}
            tabIndex={active === index ? 0 : -1}
            onClick={() => setActive(index)}
            onKeyDown={(event) => {
              let next: number;
              if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
              else if (event.key === "ArrowLeft")
                next = (index + TABS.length - 1) % TABS.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = TABS.length - 1;
              else return;
              event.preventDefault();
              setActive(next);
              refs.current[next]?.focus();
            }}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="run-evidence-stack">
        {TABS.map((tab, index) => (
          <div
            key={tab}
            id={`${id}-panel-${index}`}
            role="tabpanel"
            aria-labelledby={`${id}-tab-${index}`}
            data-active={active === index || undefined}
            aria-hidden={active !== index ? true : undefined}
            inert={active !== index}
            tabIndex={active === index ? 0 : -1}
            className="run-evidence-panel"
          >
            <div className="run-evidence-content">
              {index === 0 && (
                <>
                  <CheckoutSnapshot />
                </>
              )}
              {index === 1 && (
                <LogBlock
                  title="Browser console"
                  entries={[
                    {
                      time: "00:05",
                      level: "error",
                      message:
                        "TypeError: plan is null\n  at handlePay (page.tsx:89)",
                    },
                    {
                      time: "00:09",
                      level: "info",
                      message: "Pay now failed before sending a request.",
                    },
                  ]}
                />
              )}
              {index === 2 && (
                <figure className="run-network-block">
                  <figcaption className="run-block-header">
                    <span>Network</span>
                    <span className="run-block-meta">agent-2 · /checkout</span>
                  </figcaption>
                  <div className="run-network-summary">
                    3 clicks · 0 checkout requests
                  </div>
                  <dl className="run-network-request">
                    <div>
                      <dt>Request</dt>
                      <dd>
                        <code>POST /api/checkout</code>
                      </dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>Not sent</dd>
                    </div>
                    <div>
                      <dt>Initiator</dt>
                      <dd>
                        <code>handlePay · page.tsx:89</code>
                      </dd>
                    </div>
                  </dl>
                  <p className="run-network-note">
                    Handler threw before fetch. No request reached the server.
                  </p>
                </figure>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
