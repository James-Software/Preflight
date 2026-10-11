const STEPS = [
  {
    n: "01",
    title: "Connect your app and repo",
    body: "Point Preflight at a staging URL and connect your GitHub repo. Setup takes minutes.",
  },
  {
    n: "02",
    title: "The swarm flies",
    body: "Agents click, type, and break things like real users, across every flow, in real browsers.",
  },
  {
    n: "03",
    title: "Fixes land as PRs",
    body: "Each failure is diagnosed from your code and terminal output, then fixed in a pull request. You merge.",
  },
  {
    n: "04",
    title: "Re-run to verify",
    body: "One click flies the swarm over the fix again. Green across the board means cleared for takeoff.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-white py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-xs font-semibold tracking-[0.22em] text-primary">
          HOW IT WORKS
        </p>
        <h2 className="font-display mt-4 max-w-xl text-3xl font-bold tracking-tight text-ink md:text-4xl">
          From deploy to cleared in four steps.
        </h2>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="rounded-2xl border border-mist bg-white p-6"
            >
              <p className="font-display text-sm font-bold tracking-widest text-primary">
                {s.n}
              </p>
              <h3 className="mt-3 text-base font-semibold text-ink">
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink/60">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
