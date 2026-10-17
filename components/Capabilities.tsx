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
    <section className="bg-[#fafafa] py-24 md:py-32 dark:bg-[#05060a]">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="max-w-2xl text-balance text-4xl font-semibold tracking-tight text-ink md:text-5xl dark:text-white">
          Built like a tester, not a script.
        </h2>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-ink/60 md:text-lg dark:text-neutral-400">
          Scripts check what you told them to. PreFlight explores like someone
          seeing your app for the first time.
        </p>

        <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-ink/10 bg-ink/10 md:grid-cols-2 dark:border-white/10 dark:bg-white/10">
          {CAPABILITIES.map((c) => (
            <div key={c.n} className="bg-[#fafafa] p-8 dark:bg-[#05060a]">
              <p className="font-mono text-sm text-ink/40 dark:text-neutral-600">{c.n}</p>
              <h3 className="mt-3 text-xl font-semibold tracking-tight text-ink dark:text-white">
                {c.title}
              </h3>
              <p className="mt-2 text-base leading-relaxed text-ink/60 dark:text-neutral-400">
                {c.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
