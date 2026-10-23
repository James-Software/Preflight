"use client";

import { useId, useRef, useState } from "react";

const TABS = ["Screenshot", "Console", "Network"] as const;

export function CheckoutSnapshot() {
  return (
    <div
      className="sample-checkout"
      role="img"
      aria-label="Agent-2 screenshot of checkout: Pro selected, Pay now clicked, no response"
    >
      <div className="sample-url">agent-2 · /checkout</div>
      <div className="sample-checkout-body">
        <p className="text-sm">Your subscription</p>
        <p className="mt-2 text-2xl font-semibold">
          Pro <span className="text-sm font-normal">plan selected</span>
        </p>
        <div className="sample-pay">
          Pay now <span aria-hidden="true">↗</span>
        </div>
        <p className="mt-3 text-sm">Clicked. No response.</p>
      </div>
    </div>
  );
}

export default function RunEvidence() {
  const id = useId();
  const [active, setActive] = useState(0);
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
      {TABS.map((tab, index) => (
        <div
          key={tab}
          id={`${id}-panel-${index}`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${index}`}
          hidden={active !== index}
          tabIndex={0}
          className="run-evidence-panel"
        >
          {index === 0 && (
            <>
              <p className="mb-4 text-sm">
                Captured after the third click · agent-2
              </p>
              <CheckoutSnapshot />
            </>
          )}
          {index === 1 && (
            <pre>
              <code>
                {
                  "[agent-2] /checkout · Pro selected\nTypeError: Cannot read properties of null (reading 'id')\n  at handlePay (app/checkout/page.tsx:89)\nPay now failed before sending a request."
                }
              </code>
            </pre>
          )}
          {index === 2 && (
            <>
              <p className="mb-4 text-sm">
                Network capture · agent-2 · /checkout
              </p>
              <dl className="space-y-3">
                <div>
                  <dt className="font-semibold">POST /api/checkout</dt>
                  <dd>Not sent — handler threw before fetch.</dd>
                </div>
                <div>
                  <dt className="font-semibold">After selecting Pro</dt>
                  <dd>3 clicks · 0 checkout requests</dd>
                </div>
              </dl>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
