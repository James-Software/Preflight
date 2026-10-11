const POINTS = [
  {
    title: "Real browsers",
    body: "Tests run in real headless browsers. What the swarm sees is what your users see.",
  },
  {
    title: "Real diagnosis",
    body: "Root causes come from your code and terminal output, never guesses.",
  },
  {
    title: "Real control",
    body: "Nothing merges without you. Every fix arrives as a pull request.",
  },
];

export default function WhyStrip() {
  return (
    <section className="bg-lavender py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="font-display text-center text-2xl font-bold tracking-tight text-ink md:text-3xl">
          Real browsers. Real users. Real fixes.
        </h2>
        <div className="mx-auto mt-10 grid max-w-4xl gap-8 md:grid-cols-3">
          {POINTS.map((p) => (
            <div key={p.title} className="text-center md:text-left">
              <h3 className="text-sm font-semibold text-ink">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink/60">
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
