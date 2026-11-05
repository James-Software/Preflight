"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { Check, ChevronRight, CircleAlert, FileCode2, GitBranch, Globe, LockKeyhole } from "lucide-react";

const checks = [
  { name: "Sign in", route: "/login", title: "A session that holds.", description: "The agent signed in and verified the authenticated session.", method: "GET", endpoint: "/api/session", status: 200, result: "Session verified", log: "Session established. Authenticated account is available.", time: "84 ms" },
  { name: "Browse products", route: "/products", title: "Products, present and correct.", description: "The agent opened the catalog and checked that product details loaded.", method: "GET", endpoint: "/api/products", status: 200, result: "Product details loaded", log: "Catalog loaded. Product details rendered successfully.", time: "126 ms" },
  { name: "Save delivery address", route: "/settings/address", title: "One empty field. One broken flow.", description: "The form accepted an empty postal code. Saving returned a server error.", method: "POST", endpoint: "/api/addresses", status: 500, result: "Address was not saved", log: "POST /api/addresses 500\nValidationError: postalCode is required\n  at save (address.ts:25)\n  at saveAddress (address.ts:24)", time: "238 ms" },
] as const;

const views = ["Screenshot", "Console", "Network", "Proposed fix"] as const;
type View = (typeof views)[number];

export default function LandingTestFlight() {
  const id = useId();
  const [selected, setSelected] = useState(2);
  const [view, setView] = useState<View>("Screenshot");
  const check = checks[selected];
  const failed = check.status === 500;

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % views.length;
    else if (event.key === "ArrowLeft") next = (index + views.length - 1) % views.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = views.length - 1;
    else return;
    event.preventDefault();
    setView(views[next]);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
  }

  return (
    <div className="flight-lab" data-ui>
      <div className="flight-lab-toolbar"><div><Globe size={17} aria-hidden="true" /><span>PreFlight</span><span className="flight-lab-divider">/</span><strong>Run #128</strong></div><span>Sample run · Completed</span></div>
      <div className="flight-lab-body">
        <aside className="flight-journey" aria-label="Sample browser checks">
          <div className="flight-journey-repo"><GitBranch size={15} aria-hidden="true" /><span>acme / storefront</span><span>main</span></div>
          <p className="flight-journey-label">A browser’s-eye view.</p>
          <div className="flight-checks">
            {checks.map((item, index) => (
              <button key={item.name} type="button" aria-pressed={index === selected} onClick={() => setSelected(index)} className={`flight-check ${item.status === 500 ? "flight-check-error" : ""}`}>
                {item.status === 500 ? <CircleAlert size={18} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
                <span><strong>{item.name}</strong><span>{item.result}</span></span><ChevronRight size={15} aria-hidden="true" />
              </button>
            ))}
          </div>

        </aside>

        <div className="flight-inspection">
          <div className="flight-inspection-heading"><span className={failed ? "flight-status-error" : "flight-status-ok"}>{failed ? <CircleAlert size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}{failed ? "Finding" : "Passed"}</span><span>{check.route}</span></div>
          <h3>{check.title}</h3>
          <p className="flight-inspection-description">{check.description}</p>
          <div className="flight-tabs" role="tablist" aria-label="Evidence views">
            {views.map((item, index) => <button type="button" key={item} id={`${id}-tab-${index}`} role="tab" aria-selected={view === item} aria-controls={`${id}-panel`} tabIndex={view === item ? 0 : -1} onKeyDown={event => navigateTabs(event, index)} onClick={() => setView(item)}>{item}</button>)}
          </div>
          <div className="flight-evidence" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${views.indexOf(view)}`} tabIndex={0}>
            {view === "Screenshot" && <div className="flight-screenshot-view">
              <div className="flight-capture">
                <div className="flight-capture-bar"><LockKeyhole size={12} aria-hidden="true" /><span>storefront.example{check.route}</span></div>
                {failed ? <div className="flight-address-shot" role="img" aria-label="Captured delivery address form: 41 Market Street, postal code empty, save failed with the message Something went wrong. Try again.">
                  <span className="flight-shot-heading">Delivery address</span>
                  <span className="flight-shot-label">Street address</span><div className="flight-shot-field">41 Market Street</div>
                  <span className="flight-shot-label">Postal code</span><div className="flight-shot-field flight-shot-empty">Enter postal code</div>
                  <div className="flight-shot-button">Save address</div>
                  <span className="flight-shot-error"><CircleAlert size={13} aria-hidden="true" />Something went wrong. Try again.</span>
                </div> : <div className="flight-passed-shot"><Check size={36} strokeWidth={1.3} aria-hidden="true" /><strong>{check.result}</strong><p>{selected === 0 ? "The account is signed in and ready to use." : "The catalog and product details are available."}</p></div>}
              </div>

            </div>}
            {view === "Console" && <div className="flight-console-view"><div className="flight-evidence-label">Browser console <span>{failed ? "1 error" : "No errors"}</span></div><pre className={failed ? "flight-console-error" : ""}><code>{check.log}</code></pre><p>{failed ? "The error was captured when the agent tried to save the address." : "No browser errors were recorded during this check."}</p></div>}
            {view === "Network" && <div className="flight-network-view"><div className="flight-evidence-label">Network trace <span>1 request</span></div><dl><div><dt>Request</dt><dd><code>{check.method} {check.endpoint}</code></dd></div><div><dt>Status</dt><dd className={failed ? "flight-status-error" : "flight-status-ok"}>{check.status} {failed ? "Internal Server Error" : "OK"}</dd></div><div><dt>Duration</dt><dd>{check.time}</dd></div><div><dt>{failed ? "Request body" : "Response"}</dt><dd><code>{failed ? '{ "street": "41 Market Street", "postalCode": "" }' : selected === 0 ? '{ "authenticated": true }' : '{ "products": [ … ] }'}</code></dd></div></dl></div>}
            {view === "Proposed fix" && <div className="flight-fix-view"><div className="flight-evidence-label"><span><FileCode2 size={15} aria-hidden="true" />{failed ? "address.ts" : "Check complete"}</span><span>{failed ? "Proposed" : "Passed"}</span></div>{failed ? <><pre><code><span className="flight-code-remove">− await save(address);</span><span className="flight-code-add">+ validate(address);</span><span className="flight-code-add">+ await save(address);</span></code></pre><strong>Validate before saving.</strong><p>Return a field error when the postal code is missing, before calling the database.</p><div className="flight-fix-review">Ready for your review. Nothing merges automatically.</div></> : <div className="flight-no-fix"><Check size={32} aria-hidden="true" /><strong>No fix proposed for this check.</strong><p>The workflow passed. Select “Save delivery address” to inspect the sample finding.</p></div>}</div>}
          </div>
          <div className="flight-inspection-footer"><span className={failed ? "flight-status-error" : "flight-status-ok"}>{check.status}</span><code>{check.method} {check.endpoint}</code><span>{check.time}</span></div>
        </div>
      </div>
    </div>
  );
}
