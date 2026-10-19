"use client";

import { useEffect, useState } from "react";

const STEPS = [
  {
    title: "Find it.",
    description: "Agents explore your app in real browsers, following the paths your users take.",
    label: "A real journey. A real dead end.",
    event: "agent-02 · Checkout button did not respond after selecting Pro.",
  },
  {
    title: "Explain it.",
    description: "Screenshots, console logs, and network traces turn a finding into something you can act on.",
    label: "The evidence, connected.",
    event: "diagnosis · The plan selector leaves checkout in a disabled state.",
  },
  {
    title: "Fix it.",
    description: "Review a proposed fix in a pull request. You decide what ships, then re-run to verify.",
    label: "A small diff. A working checkout.",
    event: "fix-agent · Proposed fix ready for human review.",
  },
];

function CheckoutSample() {
  return (
    <div className="mx-auto max-w-sm py-4 sm:py-7">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink/50 dark:text-white/50">Sample checkout</p>
      <h4 className="mt-3 text-2xl font-semibold tracking-tight text-ink dark:text-white">Make room for what’s next.</h4>
      <div className="mt-6 rounded-2xl border border-primary/40 bg-primary/5 p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold text-ink dark:text-white">Pro plan</span>
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary dark:text-[#a6adff]">Selected</span>
        </div>
        <p className="mt-4 text-3xl font-semibold text-ink dark:text-white">$29<span className="text-sm font-normal text-ink/50 dark:text-white/50"> / month</span></p>
        <p className="mt-2 text-sm text-ink/60 dark:text-white/60">More projects. More room to build.</p>
      </div>
      <div className="relative mt-4 rounded-xl border border-dashed border-rose-400/60 p-2">
        <div className="rounded-lg bg-ink/10 py-3 text-center text-sm font-medium text-ink/40 dark:bg-white/10 dark:text-white/40">Continue to checkout</div>
        <span className="absolute -right-2 -top-3 rounded-full bg-rose-600 px-3 py-1 font-mono text-[10px] text-white">agent-02 · no response</span>
      </div>
      <p className="mt-4 text-center font-mono text-[11px] text-ink/50 dark:text-white/50">3 attempts · 0 network requests</p>
    </div>
  );
}

function EvidenceSample() {
  return (
    <div className="py-3 sm:py-6">
      <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-ink/60 dark:text-white/60">
        <span className="rounded-full border border-ink/10 px-3 py-1.5 dark:border-white/15">Screenshot captured</span>
        <span className="rounded-full border border-ink/10 px-3 py-1.5 dark:border-white/15">Console captured</span>
        <span className="rounded-full border border-ink/10 px-3 py-1.5 dark:border-white/15">Network captured</span>
      </div>
      <div className="mt-6 space-y-4 border-l border-ink/15 pl-5 dark:border-white/15">
        {[
          ["14:32:08", "Selected the Pro plan", "The plan changed, but the checkout state did not."],
          ["14:32:11", "Tried to continue", "The button remained disabled. No payment request was sent."],
          ["14:32:16", "Traced the state", "The handler sets the plan but never clears the loading flag."],
        ].map(([time, title, detail]) => (
          <div key={time}>
            <p className="font-mono text-[10px] text-ink/45 dark:text-white/45">{time}</p>
            <p className="mt-1 text-sm font-medium text-ink dark:text-white">{title}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink/60 dark:text-white/60">{detail}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-xl bg-primary/5 p-4 text-sm leading-relaxed text-ink/75 dark:bg-primary/10 dark:text-white/75">
        <span className="font-medium text-ink dark:text-white">Root cause:</span> checkout stays disabled after a successful plan update.
      </div>
    </div>
  );
}

function FixSample() {
  return (
    <div className="py-3 sm:py-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary dark:text-[#a6adff]">Proposed pull request</span>
        <span className="font-mono text-[11px] text-ink/50 dark:text-white/50">1 file changed</span>
      </div>
      <h4 className="mt-5 text-xl font-semibold tracking-tight text-ink dark:text-white">Restore checkout after plan selection</h4>
      <p className="mt-2 text-sm leading-relaxed text-ink/60 dark:text-white/60">Clear the loading state when the update finishes, including when it fails.</p>
      <div className="mt-6 overflow-hidden rounded-xl border border-ink/10 dark:border-white/10">
        <p className="border-b border-ink/10 bg-ink/[0.03] px-4 py-3 font-mono text-[11px] text-ink/60 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/60">app/checkout/page.tsx</p>
        <pre className="overflow-x-auto py-3 font-mono text-[12px] leading-7 text-ink/75 dark:text-white/75"><code><span className="block px-4">{"  setLoading(true);"}</span><span className="block bg-rose-500/10 px-4 text-rose-700 dark:text-rose-300">{"- await updatePlan(plan);"}</span>{[
          "+ try {",
          "+   await updatePlan(plan);",
          "+ } finally {",
          "+   setLoading(false);",
          "+ }",
        ].map((line) => <span key={line} className="block bg-emerald-500/10 px-4 text-emerald-800 dark:text-emerald-300">{line}</span>)}</code></pre>
      </div>
      <p className="mt-5 text-sm text-ink/60 dark:text-white/60">Ready for your review. You choose when to merge.</p>
    </div>
  );
}

export default function ProofChapter() {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      if (active === STEPS.length - 1) setPlaying(false);
      else setActive(active + 1);
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [active, playing]);

  const selectStep = (index: number) => {
    setPlaying(false);
    setActive(index);
  };

  const replay = () => {
    setActive(0);
    setPlaying(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  };

  return (
    <section id="how-it-works" className="scroll-mt-20 bg-[#fafafa] py-24 md:py-32 dark:bg-[#05060a]">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-ink/50 dark:text-white/50">How it works</p>
          <h2 className="mt-4 text-balance text-4xl font-semibold tracking-tight text-ink md:text-5xl dark:text-white">Watch a bug become a fix.</h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-ink/60 md:text-lg dark:text-white/60">From the first click to a proposed pull request. Follow a sample run and see what comes back.</p>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-[0.8fr_1.4fr] lg:gap-16">
          <div className="flex flex-col justify-between gap-8">
            <div className="space-y-2" role="group" aria-label="Sample run steps">
              {STEPS.map((step, index) => (
                <button key={step.title} type="button" aria-pressed={active === index} aria-controls="sample-run-panel" onClick={() => selectStep(index)} className={`w-full rounded-2xl border p-5 text-left transition-colors duration-150 motion-reduce:transition-none ${active === index ? "border-primary/25 bg-primary/5 dark:border-primary/40 dark:bg-primary/10" : "border-transparent hover:bg-ink/[0.03] dark:hover:bg-white/[0.03]"}`}>
                  <span className="flex items-center gap-4">
                    <span className={`font-mono text-xs ${active === index ? "text-primary dark:text-[#a6adff]" : "text-ink/45 dark:text-white/45"}`}>0{index + 1}</span>
                    <span className="text-xl font-semibold tracking-tight text-ink dark:text-white">{step.title}</span>
                  </span>
                  <span className="mt-3 block pl-8 text-sm leading-relaxed text-ink/60 dark:text-white/60">{step.description}</span>
                </button>
              ))}
            </div>
            <p className="px-5 text-xs leading-relaxed text-ink/50 dark:text-white/50">An illustrative run, using a sample checkout. No connection to your app required.</p>
          </div>

          <div className="min-w-0 overflow-hidden rounded-[1.75rem] border border-ink/10 bg-white shadow-[0_16px_64px_-32px_rgba(78,47,216,0.2)] dark:border-white/10 dark:bg-[#0a0c14] dark:shadow-none">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 px-5 py-4 dark:border-white/10 sm:px-7">
              <div className="flex items-center gap-2.5">
                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${active === 0 ? "bg-rose-400" : active === 1 ? "bg-amber-400" : "bg-emerald-400"}`} />
                <span className="font-mono text-xs text-ink/65 dark:text-white/65">Run #128</span>
                <span className="rounded-full border border-ink/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink/50 dark:border-white/15 dark:text-white/50">Sample</span>
              </div>
              <button type="button" onClick={playing ? () => setPlaying(false) : replay} className="rounded-full px-3 py-1.5 text-xs font-medium text-ink/65 transition-colors hover:bg-ink/5 hover:text-ink motion-reduce:transition-none dark:text-white/65 dark:hover:bg-white/5 dark:hover:text-white">{playing ? "Pause demo" : "Replay demo"}</button>
            </div>
            <div id="sample-run-panel" role="region" aria-label={STEPS[active].label} className="min-h-[430px] px-5 py-6 sm:min-h-[460px] sm:px-8">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink/45 dark:text-white/45">{STEPS[active].label}</p>
              {active === 0 ? <CheckoutSample /> : active === 1 ? <EvidenceSample /> : <FixSample />}
            </div>
            <div aria-live="polite" aria-atomic="true" className="min-h-[65px] border-t border-ink/10 bg-ink/[0.02] px-5 py-4 font-mono text-[11px] leading-relaxed text-ink/60 dark:border-white/10 dark:bg-white/[0.02] dark:text-white/60 sm:px-7">{STEPS[active].event}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
