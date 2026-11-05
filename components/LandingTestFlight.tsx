"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { CircleAlert, FileCode2, LockKeyhole } from "lucide-react";

const views = ["Evidence", "Proposed fix"] as const;

export default function LandingTestFlight() {
  const id = useId();
  const [selected, setSelected] = useState(0);

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - selected;
    setSelected(next);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
  }

  return (
    <div className="flight-lab flight-demo-simple" data-ui>
      <div className="flight-lab-toolbar">
        <strong>Save delivery address</strong>
        <span>Sample finding</span>
      </div>
      <div className="flight-inspection">
        <h3>One empty field. One broken flow.</h3>
        <p className="flight-inspection-description">
          An empty postal code slipped through. The address never saved.
        </p>
        <div className="flight-tabs" role="tablist" aria-label="Sample finding">
          {views.map((view, index) => (
            <button
              key={view}
              type="button"
              id={`${id}-tab-${index}`}
              role="tab"
              aria-selected={selected === index}
              aria-controls={`${id}-panel`}
              tabIndex={selected === index ? 0 : -1}
              onClick={() => setSelected(index)}
              onKeyDown={navigateTabs}
            >
              {view}
            </button>
          ))}
        </div>
        <div
          className="flight-evidence"
          role="tabpanel"
          id={`${id}-panel`}
          aria-labelledby={`${id}-tab-${selected}`}
          tabIndex={0}
        >
          {selected === 0 ? (
            <div className="flight-capture">
              <div className="flight-capture-bar">
                <LockKeyhole size={12} aria-hidden="true" />
                <span>storefront.example/settings/address</span>
              </div>
              <div
                className="flight-address-shot"
                role="group"
                aria-label="Sample address form: 41 Market Street, postal code empty, saving failed."
              >
                <span className="flight-shot-heading">Delivery address</span>
                <span className="flight-shot-label">Street address</span>
                <div className="flight-shot-field">41 Market Street</div>
                <span className="flight-shot-label">Postal code</span>
                <div className="flight-shot-field flight-shot-empty">Enter postal code</div>
                <button type="button" className="flight-shot-button">Save address</button>
                <span className="flight-shot-error">
                  <CircleAlert size={13} aria-hidden="true" />
                  Something went wrong. Try again.
                </span>
              </div>
            </div>
          ) : (
            <div className="flight-fix-view">
              <div className="flight-evidence-label">
                <span><FileCode2 size={15} aria-hidden="true" />address.ts</span>
              </div>
              <pre><code>
                <span className="flight-code-remove">− await save(address);</span>
                <span className="flight-code-add">+ validate(address);</span>
                <span className="flight-code-add">+ await save(address);</span>
              </code></pre>
              <strong>Validate before saving.</strong>
              <p>Return a field error when the postal code is missing.</p>
              <div className="flight-fix-review">Nothing merges without you.</div>
            </div>
          )}
        </div>
        <div className="flight-inspection-footer">
          <span className="flight-status-error">500</span>
          <code>POST /api/addresses</code>
        </div>
      </div>
    </div>
  );
}
