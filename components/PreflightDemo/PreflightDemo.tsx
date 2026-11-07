"use client";

import { useState } from "react";
import { Check, ChevronRight, CircleAlert, Code2, FileCode2, GitBranch, RotateCcw, X } from "lucide-react";
import { Stage } from "./kit/stage";
import type { Act } from "./kit/act";
import { Bar, Text, Window } from "./kit/window";
import { Row } from "./kit/parts/Row";
import { Badge } from "./kit/controls/Badge";
import { Code } from "./kit/code";
import useTheme from "../useTheme";
import "./demo.css";

type Scene = { evidence: boolean; fix: boolean };
const initial: Scene = { evidence: false, fix: false };
const poster: Scene = { evidence: true, fix: true };
const REST = { wide: { x: 480, y: 400 }, compact: { x: 304, y: 420 } };

async function script(a: Act<Scene>) {
  await a.wait(1100);
  await a.move({ at: "finding", x: 0.85, y: 0.5 });
  await a.wait(300);
  a.mark("select-finding");
  await a.click();
  await a.set({ evidence: true });
  a.mark("evidence");
  await a.move("rest");
  await a.wait(2700);
  await a.move({ at: "fix", x: 0.85, y: 0.5 });
  await a.wait(350);
  a.mark("open-fix");
  await a.click();
  await a.set({ fix: true });
  a.mark("proposed-fix");
  await a.move("rest");
  await a.wait(2800);
}

export default function PreflightDemo() {
  const theme = useTheme();
  const [run, setRun] = useState(0);
  return (
    <figure className="pf-demo" aria-label="Illustrated Preflight walkthrough">
      <div role="img" aria-label="Example run: signing in and browsing pass. Saving an address fails with a 500 response. Its evidence leads to a proposed fix that validates the postal code before saving.">
        <Stage key={run} width={1000} height={500} compact={{ below: 780, width: 358, height: 438 }} initial={initial} poster={poster} script={script} play="once" theme={theme} fidelity="realistic" cursor={{ at: REST, style: "circle" }} className="pf-scene">
          {(s, _rect, layout) => (
            <>
              <Window url="trypreflight.dev" className="pf-browser">
                <div className="pf-app">
                  {layout === "wide" && <aside className="pf-sidebar">
                    <img src={theme === "dark" ? "/logo-white.png" : "/logo.png"} width="88" height="32" alt="" />
                    <div className="pf-nav-selected">Runs</div>
                    <Text className="pf-nav">Profiles</Text>
                    <Text className="pf-nav">Database</Text>
                    <div className="pf-sidebar-filler" aria-hidden="true">{[68, 82, 54].map(w => <Bar key={w} w={w} h={6} tone={2} />)}</div>
                  </aside>}
                  <div className="pf-main" data-crop>
                    <div className="pf-run-heading"><Text>Run #128</Text><Badge tone="success">Completed</Badge></div>
                    <div className="pf-run-meta"><GitBranch size={14} /><Text>acme / storefront</Text><span>main</span></div>
                    <div className="pf-list-label">Browser checks</div>
                    <Row className="pf-check" lead={<Check size={16} className="pf-success" />} title="Sign in" subtitle={layout === "wide" ? "Session verified" : undefined} pad={12} />
                    <Row className="pf-check" lead={<Check size={16} className="pf-success" />} title="Browse products" subtitle={layout === "wide" ? "Product details loaded" : undefined} pad={12} />
                    <Row className="pf-check pf-finding" data-target="finding" data-cursor="hand" selected={s.evidence} lead={<CircleAlert size={16} className="pf-danger" />} title="Save delivery address" subtitle={layout === "wide" ? "Changes were not saved" : undefined} pad={12}><ChevronRight size={16} /></Row>
                    {layout === "wide" && <Row className="pf-check" lead={<Check size={16} className="pf-success" />} title="Update cart" subtitle="Quantity persisted" pad={12} />}
                    <div className="pf-list-filler" aria-hidden="true"><Bar w={135} h={7} tone={2} /><Bar w={90} h={6} tone={1} /></div>
                  </div>
                </div>
              </Window>
              {layout === "wide" ? (
                <Window title="Finding details" toolbar={<span className="pf-close"><X size={14} /></span>} className="pf-evidence" data-show={s.evidence}>
                  <FindingDetails fix={s.fix} />
                </Window>
              ) : (
                <aside className="pf-evidence pf-evidence-sheet" data-show={s.evidence}>
                  <div className="pf-sheet-heading">Finding details <span className="pf-close"><X size={14} /></span></div>
                  <FindingDetails fix={s.fix} />
                </aside>
              )}
              <span data-target="rest" style={{ position: "absolute", left: REST[layout].x, top: REST[layout].y }} />
            </>
          )}
        </Stage>
      </div>
      <div className="pf-playback">
        <button type="button" onClick={() => setRun(n => n + 1)}><RotateCcw size={13} /> Replay demo</button>
      </div>
    </figure>
  );
}

function FindingDetails({ fix }: { fix: boolean }) {
  return (
  <div className="pf-evidence-body">
    <div className="pf-issue-heading"><CircleAlert size={16} className="pf-danger" /><Text>Address was not saved</Text></div>
    <div className="pf-tabs">
      <div className="pf-tab" data-active={!fix}>Evidence</div>
      <div className="pf-tab" data-active={fix} data-target="fix" data-cursor="hand">Proposed fix</div>
    </div>
    <div className="pf-detail-tracks">
      <div className="pf-detail" data-on={!fix}>
        <div className="pf-screenshot">
          <div className="pf-shot-label">Delivery address</div>
          <div className="pf-field">41 Market Street</div>
          <div className="pf-field pf-postcode">Postal code <span>—</span></div>
          <div className="pf-save">Save address</div>
          <div className="pf-shot-error"><X size={12} /> Something went wrong. Try again.</div>
        </div>
        <div className="pf-request"><Badge tone="danger">500</Badge><code>POST /api/addresses</code></div>
        <Text className="pf-detail-note">The form accepted an empty postal code.</Text>
      </div>
      <div className="pf-detail" data-on={fix}>
        <div className="pf-file"><FileCode2 size={14} /><Text>address.ts</Text><Badge>Proposed</Badge></div>
        <Code start={24} className="pf-code" lines={[
          { text: "await save(address);", kind: "del" },
          { text: "validate(address);", kind: "add" },
          { text: "await save(address);", kind: "add" },
        ]} />
        <div className="pf-fix-explanation"><Text>Validate before saving.</Text><Text className="pf-detail-note">Return a field error when the postal code is missing.</Text></div>
        <div className="pf-review"><Code2 size={14} /><Text>Ready for your review</Text></div>
      </div>
    </div>
  </div>
  );
}
