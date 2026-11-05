import LandingTestFlight from "./LandingTestFlight";

export default function ProductOverview() {
  return (
    <section id="how-it-works" className="flight-explore" aria-labelledby="flight-explore-title">
      <div className="flight-section-heading">
        <h2 id="flight-explore-title">Take the<br />unexpected turn.</h2>
        <div className="flight-section-intro">
          <p>Agents explore your app and bring back evidence of what breaks. Follow a sample finding from failure to proposed fix.</p>
        </div>
      </div>
      <LandingTestFlight />
      <p className="flight-explore-caption">Interactive sample run. Nothing merges without you.</p>
    </section>
  );
}
