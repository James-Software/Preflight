import RunScrollSequence from "./RunScrollSequence";
import { BranchIcon, PullRequestIcon } from "./GitIcons";
import RunEvidence, { CheckoutSnapshot } from "./RunEvidence";
import { FixCodeBlock, LogBlock } from "./SampleRunBlocks";

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
        <RunScrollSequence>
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
              <LogBlock
                title="Agent trace"
                entries={[
                  { time: "00:01", level: "info", message: "Loaded /checkout" },
                  {
                    time: "00:03",
                    level: "info",
                    message: "Selected plan “Pro”",
                  },
                  {
                    time: "00:05",
                    level: "info",
                    message: "Clicked “Pay now”: no response",
                  },
                  {
                    time: "00:09",
                    level: "info",
                    message: "Retried 3×: still nothing",
                  },
                  {
                    time: "00:10",
                    level: "error",
                    message: "BUG: checkout button dead after plan select",
                  },
                  {
                    time: "00:12",
                    level: "judge",
                    message:
                      "root cause: handler reads plan from a stale closure",
                  },
                  {
                    time: "00:16",
                    level: "fix",
                    message: "Fix ready: opening PR #436",
                  },
                ]}
              />
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
              <FixCodeBlock />
              <p className="run-added mt-4 font-medium">Fix ready for review</p>
            </div>
          </div>
          <footer className="run-pr">
            <p className="run-branch mb-4">
              <BranchIcon />
              fix/checkout{" "}
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                aria-hidden="true"
              >
                <path d="M4 12h16m-6-6 6 6-6 6" />
              </svg>
              <span className="sr-only">into</span> main
            </p>
            <p className="text-sm">Your code. Your merge decision.</p>
            <div className="run-pr-title">
              <PullRequestIcon />
              <p className="text-lg font-semibold leading-relaxed">
                PR #436 · fix(checkout): guard stale plan in Pay now handler{" "}
                <span className="font-normal">· awaiting your merge</span>
              </p>
            </div>
          </footer>
        </RunScrollSequence>
      </div>
    </section>
  );
}
