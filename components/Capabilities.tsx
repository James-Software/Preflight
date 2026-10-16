/**
 * Secondary capabilities as a flat Warp-style numbered list.
 * No boxes, no icons, no accent color — the list is the design.
 */
const CAPABILITIES = [
  {
    n: "01",
    title: "Real browsers",
    body: "Every agent drives its own real browser and uses your app like a person would.",
  },
  {
    n: "02",
    title: "Evidence with every bug",
    body: "Screenshots, console logs, and network traces attached to each finding.",
  },
  {
    n: "03",
    title: "Root-cause diagnosis",
    body: "Agents pair what they saw in the browser with your source code to explain why it broke.",
  },
  {
    n: "04",
    title: "Fix pull requests",
    body: "Confident fixes open as PRs with the diff. Nothing ever merges without you.",
  },
];

export default function Capabilities() {
  return (
    <section className="bg-[#05060a] py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="max-w-2xl text-balance text-4xl font-semibold tracking-tight text-white md:text-5xl">
          Built like a tester, not a script.
        </h2>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-neutral-400 md:text-lg">
          Scripts check what you told them to. PreFlight explores like someone
          seeing your app for the first time.
        </p>

        <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 md:grid-cols-2">
          {CAPABILITIES.map((c) => (
            <div key={c.n} className="bg-[#05060a] p-8">
              <p className="font-mono text-sm text-neutral-600">{c.n}</p>
              <h3 className="mt-3 text-xl font-semibold tracking-tight text-white">
                {c.title}
              </h3>
              <p className="mt-2 text-base leading-relaxed text-neutral-400">
                {c.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
