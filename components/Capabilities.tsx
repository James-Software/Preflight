"use client";

import { useState } from "react";

const JOURNEYS = [
  {
    name: "The first-time visitor",
    brief: "No shortcuts. No insider knowledge.",
    description: "Can someone who has never seen your app find their way from the landing page to their first project?",
    steps: ["Discover the app", "Create an account", "Start a project"],
    focus: "Onboarding, navigation, and the first-run experience.",
  },
  {
    name: "The returning customer",
    brief: "Picking up where they left off.",
    description: "Can an existing customer get back into their workspace, change their plan, and keep moving?",
    steps: ["Sign back in", "Open the workspace", "Change a plan"],
    focus: "Sessions, saved state, and the flows people come back for.",
  },
  {
    name: "The mobile user",
    brief: "A smaller screen. The same expectations.",
    description: "Can someone on a phone reach the important controls and finish the journey without getting stuck?",
    steps: ["Open on mobile", "Navigate the menu", "Complete a task"],
    focus: "Responsive layouts, menus, and controls within reach.",
  },
];

export default function Capabilities() {
  const [journey, setJourney] = useState(0);
  const selected = JOURNEYS[journey];

  return (
    <>
      <section aria-labelledby="journeys-heading" className="bg-[#fafafa] pb-24 pt-8 md:pb-32 dark:bg-[#05060a]">
        <div className="mx-auto max-w-6xl px-6">
          <div className="border-t border-ink/10 pt-16 md:pt-24 dark:border-white/10">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-ink/50 dark:text-white/50">Different paths. Same app.</p>
            <h2 id="journeys-heading" className="mt-4 max-w-2xl text-balance text-4xl font-semibold tracking-tight text-ink md:text-5xl dark:text-white">Your users don’t all<br className="hidden sm:block" /> take the same route.</h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-ink/60 md:text-lg dark:text-white/60">Give agents a journey. They explore the clicks, choices, and dead ends along the way.</p>
          </div>

          <div className="mt-10 grid gap-3 md:grid-cols-3" role="group" aria-label="Explore example user journeys">
            {JOURNEYS.map((item, index) => (
              <button type="button" key={item.name} onClick={() => setJourney(index)} aria-pressed={journey === index} aria-controls="journey-detail" className={`rounded-2xl border p-6 text-left transition-colors duration-150 motion-reduce:transition-none ${journey === index ? "border-primary/30 bg-primary/5 dark:border-primary/40 dark:bg-primary/10" : "border-ink/10 hover:border-primary/30 hover:bg-white dark:border-white/10 dark:hover:border-primary/40 dark:hover:bg-white/[0.02]"}`}>
                <span className={`font-mono text-[11px] ${journey === index ? "text-primary dark:text-[#a6adff]" : "text-ink/45 dark:text-white/45"}`}>JOURNEY 0{index + 1}</span>
                <span className="mt-5 block text-lg font-semibold tracking-tight text-ink dark:text-white">{item.name}</span>
                <span className="mt-2 block text-sm leading-relaxed text-ink/60 dark:text-white/60">{item.brief}</span>
              </button>
            ))}
          </div>

          <div id="journey-detail" role="region" aria-label={selected.name} className="mt-5 rounded-[1.75rem] border border-ink/10 bg-white p-6 dark:border-white/10 dark:bg-[#0a0c14] sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <p className="max-w-md text-sm leading-relaxed text-ink/65 dark:text-white/65">{selected.description}</p>
              <ol className="flex flex-wrap items-center gap-x-4 gap-y-3" aria-label="Example journey steps">
                {selected.steps.map((step, index) => (
                  <li key={step} className="flex items-center gap-2 text-xs text-ink/75 dark:text-white/75">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/5 font-mono text-[10px] text-primary dark:text-[#a6adff]">{index + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
            <p className="mt-6 border-t border-ink/10 pt-4 font-mono text-[11px] leading-relaxed text-ink/50 dark:border-white/10 dark:text-white/50">Example coverage · {selected.focus}</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="control-heading" className="bg-[#fafafa] pb-24 md:pb-32 dark:bg-[#05060a]">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 lg:grid-cols-2 lg:gap-20">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-ink/50 dark:text-white/50">Human in the loop</p>
            <h2 id="control-heading" className="mt-4 text-balance text-4xl font-semibold tracking-tight text-ink md:text-5xl dark:text-white">You’re still<br />the pilot.</h2>
            <p className="mt-5 max-w-md text-base leading-relaxed text-ink/60 md:text-lg dark:text-white/60">Agents do the investigating. You keep the final say over your code.</p>
            <ul className="mt-8 space-y-4 text-sm leading-relaxed text-ink/70 dark:text-white/70">
              <li className="border-l-2 border-primary/30 pl-4">Connect only the repositories you choose.</li>
              <li className="border-l-2 border-primary/30 pl-4">Review the evidence alongside the proposed change.</li>
              <li className="border-l-2 border-primary/30 pl-4">Merge when you’re ready. Re-run to verify.</li>
            </ul>
          </div>

          <div className="rounded-[1.75rem] border border-ink/10 bg-white p-6 dark:border-white/10 dark:bg-[#0a0c14] sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-[11px] text-ink/50 dark:text-white/50">SAMPLE PULL REQUEST</p>
              <span className="rounded-full border border-primary/25 bg-primary/5 px-3 py-1 text-[11px] font-medium text-primary dark:text-[#a6adff]">Open for review</span>
            </div>
            <h3 className="mt-7 text-xl font-semibold tracking-tight text-ink dark:text-white">Restore checkout after plan selection</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink/60 dark:text-white/60">A focused fix, with the context you need to make the call.</p>
            <dl className="mt-7 divide-y divide-ink/10 border-y border-ink/10 text-sm dark:divide-white/10 dark:border-white/10">
              <div className="flex justify-between gap-4 py-4"><dt className="text-ink/55 dark:text-white/55">Evidence</dt><dd className="text-right text-ink/80 dark:text-white/80">Screenshot, logs & trace</dd></div>
              <div className="flex justify-between gap-4 py-4"><dt className="text-ink/55 dark:text-white/55">Proposed change</dt><dd className="text-ink/80 dark:text-white/80">1 file</dd></div>
              <div className="flex justify-between gap-4 py-4"><dt className="text-ink/55 dark:text-white/55">Next step</dt><dd className="font-medium text-primary dark:text-[#a6adff]">Your review</dd></div>
            </dl>
            <p className="mt-6 text-xs leading-relaxed text-ink/50 dark:text-white/50">Your repository. Your decision. Nothing merges without you.</p>
          </div>
        </div>
      </section>
    </>
  );
}
