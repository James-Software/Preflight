import RunEvidence, { CheckoutSnapshot } from "./RunEvidence";

const trace = `agent-2 loaded /checkout
agent-2 selected plan “Pro”
agent-2 clicked “Pay now”: no response
agent-2 retried 3×: still nothing`;

export default function ProofChapter() {
  return (
    <section
      id="how-it-works"
      className="annotated-run scroll-mt-24 bg-page font-sans text-ink dark:text-white"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="run-intro">
          <h2 className="text-balance font-semibold tracking-tight">
            Every run ends in a pull request.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed md:text-lg">
            Three agents. One dead checkout button. Follow the evidence from the
            first click to a fix you can review.
          </p>
        </div>
        <p className="mb-4 mt-10 text-sm">Sample run</p>
        <div data-ui="annotated-run" className="run-artifact">
          <header className="run-header">
            <p className="text-lg font-semibold">Run #128</p>
            <p className="text-sm">3 agents · 47 steps · 1 finding</p>
          </header>
          <div className="run-row">
            <div className="run-annotation">
              <h3>Real browsers</h3>
              <p>
                Every agent drives its own real browser and uses your app like a
                person would.
              </p>
            </div>
            <div className="run-pane">
              <CheckoutSnapshot />
            </div>
          </div>
          <div className="run-row">
            <div className="run-annotation">
              <h3>Evidence with every bug</h3>
              <p>
                Screenshots, console logs, and network traces attached to each
                finding.
              </p>
            </div>
            <div className="run-pane">
              <RunEvidence />
            </div>
          </div>
          <div className="run-row">
            <div className="run-annotation">
              <h3>Root-cause diagnosis</h3>
              <p>
                Agents pair what they saw in the browser with your source code
                to explain why it broke.
              </p>
            </div>
            <div className="run-pane">
              <p className="mb-4 font-semibold">Agent trace</p>
              <pre>
                <code>{trace}</code>
              </pre>
              <pre className="run-bug mt-3">
                <code>BUG: checkout button dead after plan select</code>
              </pre>
              <pre className="mt-3">
                <code>
                  {
                    "judge → root cause: handler reads plan from a stale closure"
                  }
                </code>
              </pre>
              <p className="mt-4 text-sm">
                The empty dependency list below keeps the initial, null plan in
                the handler.
              </p>
            </div>
          </div>
          <div className="run-row">
            <div className="run-annotation">
              <h3>Fix pull requests</h3>
              <p>
                Confident fixes open as PRs with the diff. Nothing ever merges
                without you.
              </p>
            </div>
            <div className="run-pane">
              <p className="mb-4 break-words text-sm font-semibold">
                app/checkout/page.tsx
              </p>
              <pre>
                <code>
                  {"  const handlePay = useCallback(() => {\n"}
                  <span className="run-removed">{"-   pay(plan.id);\n"}</span>
                  <span className="run-added">
                    {
                      "+   if (!plan || processing) return;\n+   pay(plan.id);\n"
                    }
                  </span>
                  <span className="run-removed run-source">
                    {"- }, []); // stale closure\n"}
                  </span>
                  <span className="run-added">
                    {"+ }, [plan, processing]);\n"}
                  </span>
                  {"  <button onClick={handlePay}>Pay now</button>"}
                </code>
              </pre>
              <p className="run-added mt-4 font-medium">Fix ready for review</p>
            </div>
          </div>
          <footer className="run-pr">
            <p className="text-sm">Your code. Your merge decision.</p>
            <p className="mt-2 text-lg font-semibold leading-relaxed">
              PR #436 · fix(checkout): guard stale plan in Pay now handler{" "}
              <span className="font-normal">· awaiting your merge</span>
            </p>
          </footer>
        </div>
      </div>
    </section>
  );
}
