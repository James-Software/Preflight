"use client";

import { useState } from "react";
import { Check, ChevronRight, CircleAlert, FileCode2, GitBranch, GitMerge, LoaderCircle, RotateCcw, X } from "lucide-react";
import { Stage } from "./kit/stage";
import type { Act } from "./kit/act";
import { Bar, Text, Window } from "./kit/window";
import { Row } from "./kit/parts/Row";
import { Badge } from "./kit/controls/Badge";
import { Code } from "./kit/code";
import { Camera } from "./kit/motion/Camera";
import { States } from "./kit/motion/States";
import type { Rect } from "./kit/measure";
import useTheme from "../useTheme";
import "./demo.css";

type Phase = "exploring" | "reproducing" | "preparing" | "ready" | "merged";
type Scene = { evidence: boolean; fix: boolean; phase: Phase; focus: Rect | null };
const initial: Scene = { evidence: false, fix: false, phase: "exploring", focus: null };
const poster: Scene = { evidence: true, fix: true, phase: "ready", focus: null };
const REST = { wide: { x: 480, y: 458 }, compact: { x: 300, y: 450 } };

async function script(a: Act<Scene>) {
  a.mark("exploring");
  await a.wait(1300);
  await a.set({ evidence: true, phase: "reproducing" });
  a.mark("failure-found");
  await a.wait(1800);
  await a.set({ phase: "preparing" });
  a.mark("preparing-fix");
  await a.wait(1700);
  await a.set({ phase: "ready", fix: true });
  a.mark("pr-ready");
  await a.wait(1800);
  await a.set({ focus: a.rect("review-panel", { layout: true }) });
  a.mark("zoom-review");
  await a.wait(1100);
  await a.move({ at: "merge", x: 0.92, y: 0.75 }, { duration: 1200 });
  await a.wait(220);
  a.mark("merge-pr");
  await a.click();
  await a.set({ phase: "merged" });
  a.mark("merged");
  await a.wait(500);
  await a.move("rest", { duration: 650 });
  await a.set({ focus: null });
  await a.wait(1100);
  a.mark("complete");
  await a.wait(1800);
}

export default function PreflightDemo() {
  const theme = useTheme();
  const [run, setRun] = useState(0);
  return (
    <figure className="pf-demo" aria-label="Illustrated Preflight walkthrough">
      <div role="img" aria-label="Example autonomous run: agents explore the app, reproduce an address-save failure, prepare a fix and open PR 42 with passing checks. A person reviews the patch and clicks Merge PR.">
        <Stage key={run} width={1000} height={540} compact={{ below: 780, width: 358, height: 476 }} initial={initial} poster={poster} script={script} play="once" theme={theme} fidelity="realistic" cursor={{ at: REST, style: "circle" }} className="pf-scene">
          {(s, _rect, layout) => (
            <>
              <Camera className="pf-camera" focus={s.focus} max={layout === "wide" ? 1.2 : 1.04} pad={layout === "wide" ? 24 : 4} duration={1100} feather={layout === "wide" ? 20 : 8}>
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
                    <div className="pf-run-heading"><Text>Run #128</Text><Badge tone={s.phase === "ready" || s.phase === "merged" ? "success" : undefined}><States value={s.phase === "ready" || s.phase === "merged" ? "done" : "running"} states={{ running: "Agents running", done: "Completed" }} /></Badge></div>
                    <div className="pf-run-meta"><GitBranch size={14} /><Text>acme / storefront</Text><span>main</span></div>
                    <div className="pf-list-label">Browser checks</div>
                    <Row className="pf-check" lead={<Check size={16} className="pf-success" />} title="Sign in" subtitle={layout === "wide" ? "Session verified" : undefined} pad={12} />
                    <Row className="pf-check" lead={<Check size={16} className="pf-success" />} title="Browse products" subtitle={layout === "wide" ? "Product details loaded" : undefined} pad={12} />
                    <Row className="pf-check pf-finding" data-target="finding" selected={s.evidence} lead={<States value={s.phase === "exploring" ? "testing" : "failed"} states={{ testing: <LoaderCircle size={16} className="pf-spin" />, failed: <CircleAlert size={16} className="pf-danger" /> }} />} title="Save delivery address" subtitle={layout === "wide" ? <States align="start" value={s.phase === "exploring" ? "testing" : "failed"} states={{ testing: "Agent exploring this flow", failed: "Changes were not saved" }} /> : undefined} pad={12}><ChevronRight size={16} /></Row>
                    {layout === "wide" && <Row className="pf-check" lead={<Check size={16} className="pf-success" />} title="Update cart" subtitle="Quantity persisted" pad={12} />}
                    <div className="pf-list-filler" aria-hidden="true"><Bar w={135} h={7} tone={2} /><Bar w={90} h={6} tone={1} /></div>
                  </div>
                </div>
              </Window>
              {layout === "wide" ? (
                <Window title="Finding details" toolbar={<span className="pf-close"><X size={14} /></span>} className="pf-evidence" data-target="review-panel" data-show={s.evidence}>
                  <FindingDetails fix={s.fix} phase={s.phase} />
                </Window>
              ) : (
                <aside className="pf-evidence pf-evidence-sheet" data-target="review-panel" data-show={s.evidence}>
                  <div className="pf-sheet-heading">Finding details <span className="pf-close"><X size={14} /></span></div>
                  <FindingDetails fix={s.fix} phase={s.phase} />
                </aside>
              )}
              </Camera>
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

function FindingDetails({ fix, phase }: { fix: boolean; phase: Phase }) {
  const ready = phase === "ready" || phase === "merged";
  return (
  <div className="pf-evidence-body">
    <div className="pf-issue-heading"><CircleAlert size={16} className="pf-danger" /><Text>Address was not saved</Text></div>
    <div className="pf-tabs">
      <div className="pf-tab" data-active={!fix}>Evidence</div>
      <div className="pf-tab" data-active={fix}>Proposed fix</div>
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
      </div>
      <div className="pf-detail" data-on={fix}>
        <div className="pf-file"><FileCode2 size={14} /><Text>address.ts</Text><Badge>PR #42</Badge></div>
        <Code start={24} className="pf-code" lines={[
          { text: "async function submit(address) {" },
          { text: "await save(address);", kind: "del" },
          { text: "validate(address);", kind: "add" },
          { text: "await save(address);", kind: "add" },
          { text: "}" },
        ]} />
        <div className="pf-fix-explanation"><Text>Agent added postal code validation.</Text></div>
      </div>
    </div>
    <div className="pf-agent-footer">
      <States value={phase} align="start" className="pf-agent-status" states={{
        exploring: <><AgentIcon /><span>Agent exploring</span></>,
        reproducing: <><AgentIcon /><span>Agent reproducing</span></>,
        preparing: <><AgentIcon /><span>Agent writing fix</span></>,
        ready: <><AgentIcon complete /><span>Checks passed</span></>,
        merged: <><AgentIcon complete /><span>PR #42 merged</span></>,
      }} />
      <div className="pf-merge" data-target="merge" data-cursor="hand" data-show={ready} data-merged={phase === "merged"}>
        <States value={phase === "merged" ? "merged" : "ready"} states={{
          ready: <><span className="pf-status-icon"><GitMerge size={14} /></span><span>Merge PR</span></>,
          merged: <><span className="pf-status-icon"><Check size={14} /></span><span>Merged</span></>,
        }} />
      </div>
    </div>
  </div>
  );
}

function AgentIcon({ complete = false }: { complete?: boolean }) {
  return <span className="pf-status-icon">{complete ? <Check size={14} className="pf-success" /> : <LoaderCircle size={14} className="pf-spin" />}</span>;
}
