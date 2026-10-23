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
          <p className="mt-5 text-base leading-relaxed md:text-lg">
            A sample run. One bug. One fix.
          </p>
        </div>
        <RunScrollSequence>
          <article>
            <div className="run-scene-caption">
              <h3>A real browser. A real bug.</h3>
              <p>Pro selected. “Pay now” does nothing.</p>
            </div>
            <CheckoutSnapshot />
          </article>
          <article>
            <div className="run-scene-caption">
              <h3>The evidence, captured.</h3>
              <p>The screenshot, the error, the missing request.</p>
            </div>
            <RunEvidence />
          </article>
          <article>
            <div className="run-scene-caption">
              <h3>The cause, found.</h3>
              <p>The handler is reading an old plan.</p>
            </div>
            <LogBlock
              title="Agent trace"
              entries={[
                {
                  time: "00:05",
                  level: "error",
                  message: "Pay now: no response",
                },
                {
                  time: "00:12",
                  level: "judge",
                  message: "Stale closure → app/checkout/page.tsx:90",
                },
                {
                  time: "00:16",
                  level: "fix",
                  message: "Use the current plan. Guard the handler.",
                },
              ]}
            />
          </article>
          <article>
            <div className="run-scene-caption">
              <h3>A fix. Yours to merge.</h3>
              <p>Nothing merges without you.</p>
            </div>
            <FixCodeBlock compact />
            <div className="run-result">
              <span className="run-branch">
                <BranchIcon />
                fix/checkout{" "}
                <span className="run-branch-target">into main</span>
              </span>
              <p>
                <PullRequestIcon />
                <span>PR #436 · awaiting your merge</span>
              </p>
            </div>
          </article>
        </RunScrollSequence>
      </div>
    </section>
  );
}
