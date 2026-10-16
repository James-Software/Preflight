/* ------------------------------------------------------------------ */
/* FixPRs — "Every bug comes back as a fix."                           */
/*                                                                    */
/* Simple dark section: the swarm finds bugs, PreFlight diagnoses the  */
/* root cause, and opens a pull request with the fix. Human merge      */
/* gate stays in place.                                               */
/* ------------------------------------------------------------------ */

const STEPS = [
  {
    n: "1",
    title: "Find",
    body: "Agents reproduce the bug with screenshots, console logs, and network evidence attached.",
  },
  {
    n: "2",
    title: "Diagnose",
    body: "The root cause is traced through your code, not guessed from the symptom.",
  },
  {
    n: "3",
    title: "Fix",
    body: "A pull request opens with the fix. You review it, you merge it. Nothing lands without you.",
  },
];

export default function FixPRs() {
  return (
    <section
      id="how-it-works"
      className="scroll-mt-20 bg-[#05060a] py-24 md:py-32"
    >
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-xs font-semibold tracking-[0.22em] text-primary">
          FIX PRS
        </p>
        <h2 className="font-display mt-4 max-w-2xl text-3xl font-bold tracking-tight text-white md:text-5xl">
          Every bug comes back as a fix.
        </h2>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/60 md:text-lg">
          PreFlight does not just find bugs. It figures out what caused them,
          writes the fix, and opens a pull request on your repo. Your morning
          starts with fixes to review, not bugs to chase.
        </p>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="rounded-2xl border border-white/10 bg-white/[0.02] p-7"
            >
              <p className="font-display text-sm font-bold text-primary">
                {s.n}
              </p>
              <h3 className="font-display mt-3 text-xl font-bold text-white">
                {s.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-white/55">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
