/**
 * The proof chapter. One claim, one or two sentences, one real artifact:
 * a sample agent run showing the bug found, the trace, and the fix PR.
 * (Linear / Cursor / Warp pattern. No cards, no kicker color.)
 */
export default function ProofChapter() {
  return (
    <section className="bg-[#05060a] py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
          How it works
        </p>
        <h2 className="mt-4 max-w-2xl text-balance text-4xl font-semibold tracking-tight text-white md:text-5xl">
          Every run ends in a pull request.
        </h2>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-neutral-400 md:text-lg">
          PreFlight sends a swarm of agents through your app like real users.
          Every bug they find comes back with the evidence and a fix, ready for
          you to merge.
        </p>

        {/* Sample run artifact */}
        <div className="mt-12 overflow-hidden rounded-xl border border-white/10 bg-[#0a0c14]">
          {/* Run header */}
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
            <div className="flex items-center gap-3">
              <span
                className="h-2 w-2 rounded-full bg-emerald-400"
                aria-hidden="true"
              />
              <span className="font-mono text-sm text-white">
                Run #128
              </span>
              <span className="rounded-full border border-white/10 px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-500">
                Sample
              </span>
            </div>
            <span className="hidden font-mono text-xs text-neutral-500 sm:block">
              3 agents · 47 steps · 1 finding
            </span>
          </div>

          <div className="grid md:grid-cols-2">
            {/* Agent trace */}
            <div className="border-b border-white/10 p-5 md:border-b-0 md:border-r">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                Agent trace
              </p>
              <div className="mt-4 space-y-2.5 font-mono text-[13px] leading-relaxed">
                <p className="text-neutral-500">
                  <span className="text-neutral-300">agent-2</span> loaded
                  /checkout
                </p>
                <p className="text-neutral-500">
                  <span className="text-neutral-300">agent-2</span> selected
                  plan “Pro”
                </p>
                <p className="text-neutral-500">
                  <span className="text-neutral-300">agent-2</span> clicked “Pay
                  now” — no response
                </p>
                <p className="text-neutral-500">
                  <span className="text-neutral-300">agent-2</span> retried 3× —
                  still nothing
                </p>
                <p className="text-red-400">
                  ✕ BUG: checkout button dead after plan select
                </p>
                <p className="text-neutral-500">
                  captured screenshot, console log, network trace
                </p>
                <p className="text-neutral-500">
                  <span className="text-neutral-300">judge</span> root cause:
                  handler reads plan from a stale closure
                </p>
                <p className="text-emerald-400">
                  ✓ fix ready — opening pull request
                </p>
              </div>
            </div>

            {/* PR diff */}
            <div className="p-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                Fix diff
              </p>
              <div className="mt-4 overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-4 font-mono text-[13px] leading-relaxed">
                <p className="text-neutral-500">
                  --- a/app/checkout/page.tsx
                </p>
                <p className="text-neutral-500">
                  +++ b/app/checkout/page.tsx
                </p>
                <p className="mt-2 text-neutral-600">@@ -88,7 +88,7 @@</p>
                <p className="whitespace-pre text-red-400/90">
                  -{"  "}&lt;button onClick=&#123;() =&gt; pay(plan.id)&#125;
                  disabled=&#123;!plan&#125;&gt;
                </p>
                <p className="whitespace-pre text-emerald-400/90">
                  +{"  "}&lt;button onClick=&#123;() =&gt; plan &amp;&amp;
                  pay(plan.id)&#125;
                </p>
                <p className="whitespace-pre text-emerald-400/90">
                  +{"    "}disabled=&#123;!plan || processing&#125;&gt;
                </p>
                <p className="whitespace-pre text-neutral-300">
                  {"    "}Pay now
                </p>
                <p className="whitespace-pre text-neutral-300">
                  {"  "}&lt;/button&gt;
                </p>
              </div>
            </div>
          </div>

          {/* Run footer */}
          <div className="flex items-center justify-between border-t border-white/10 px-5 py-3.5">
            <p className="text-sm text-neutral-400">
              <a
                href="#early-access"
                className="font-medium text-primary transition-colors duration-150 hover:text-white"
              >
                PR #436
              </a>{" "}
              opened with the fix and full evidence
            </p>
            <span className="hidden font-mono text-xs text-neutral-500 sm:block">
              awaiting your merge
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
