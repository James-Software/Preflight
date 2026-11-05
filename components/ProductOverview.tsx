import { ArrowUpRight, GitPullRequest } from "lucide-react";
import LandingTestFlight from "./LandingTestFlight";

export default function ProductOverview() {
  return (
    <>
      <section id="how-it-works" className="flight-explore" aria-labelledby="flight-explore-title">
        <div className="flight-section-heading">
          <h2 id="flight-explore-title">Take the<br />unexpected turn.</h2>
          <div className="flight-section-intro">
            <p>Real users don’t follow a script.<br />Your tests shouldn’t have to, either.</p>
            <p>Agents explore your app, including signed-in pages, and investigate what breaks. Take a look inside a sample run.</p>
          </div>
        </div>
        <LandingTestFlight />
        <div className="flight-explore-caption"><span>An illustrative run. Real-shaped evidence.</span><span>Explore the checks and switch evidence views above.</span></div>
      </section>
      <section className="flight-story" aria-labelledby="flight-story-title">
        <div className="flight-story-top">
          <h2 id="flight-story-title">The whole story.<br /><span>Down to the line.</span></h2>
          <p>A screenshot shows what happened. Console logs and network traces show the trail. Source investigation helps explain why.</p>
        </div>
        <div className="flight-story-detail">
          <div className="flight-story-note">
            <span className="flight-note-heading">From a failed request<br />to a way forward.</span>
            <p>Review the evidence and proposed fix together. Connect a database to verify that supported actions saved their changes.</p>
            <a href="#how-it-works">Inspect the sample run <ArrowUpRight size={17} aria-hidden="true" /></a>
          </div>
          <figure className="flight-diff" data-ui>
            <figcaption><span>address.ts</span><span>Proposed fix</span></figcaption>
            <div className="flight-diff-context"><span>24</span><code>{"async function saveAddress(address) {"}</code></div>
            <div className="flight-diff-line flight-diff-remove"><span>−</span><code>await save(address);</code></div>
            <div className="flight-diff-line flight-diff-add"><span>+</span><code>validate(address);</code></div>
            <div className="flight-diff-line flight-diff-add"><span>+</span><code>await save(address);</code></div>
            <div className="flight-diff-context"><span>28</span><code>{"}"}</code></div>
            <div className="flight-diff-payoff"><GitPullRequest size={21} aria-hidden="true" /><div><strong>A fix. Yours to review.</strong><span>Nothing merges without you.</span></div></div>
          </figure>
        </div>
      </section>
    </>
  );
}
