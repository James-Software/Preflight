/**
 * The proof chapter. One claim, one or two sentences, one real artifact:
 * a sample agent run showing the bug found, the trace, and the fix PR.
 * (Linear / Cursor / Warp pattern. No cards, no kicker color.)
 */
export default function ProofChapter() {
  return (
    <section id="how-it-works" className="bg-[#fafafa] py-24 md:py-32 scroll-mt-20 dark:bg-[#05060a]">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex items-center justify-between gap-10">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-ink/40 dark:text-neutral-500">
              How it works
            </p>
            <h2 className="mt-4 text-balance text-4xl font-semibold tracking-tight text-ink md:text-5xl dark:text-white">
              Every run ends in a pull request.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-ink/60 md:text-lg dark:text-neutral-400">
              PreFlight sends a swarm of agents through your app like real
              users. Every bug they find comes back with the evidence and a
              fix, ready for you to merge.
            </p>
          </div>
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className="hidden h-64 w-64 shrink-0 text-ink md:block dark:text-white"
            aria-hidden="true"
          >
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
          </svg>
        </div>

        {/* Sample run artifact */}
        <div className="mt-12 overflow-hidden rounded-xl border border-ink/10 bg-white shadow-[0_8px_30px_rgba(30,27,75,0.08)] dark:border-white/10 dark:bg-[#0a0c14] dark:shadow-none">
          {/* Run header */}
          <div className="flex items-center justify-between border-b border-ink/10 px-5 py-3.5 dark:border-white/10">
            <div className="flex items-center gap-3">
              <span
                className="h-2 w-2 rounded-full bg-emerald-400"
                aria-hidden="true"
              />
              <span className="font-mono text-sm text-ink dark:text-white">
                Run #128
              </span>
              <span className="rounded-full border border-ink/10 px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink/40 dark:border-white/10 dark:text-neutral-500">
                Sample
              </span>
              <span
                className="hidden items-center gap-1.5 font-mono text-xs text-ink/40 sm:flex dark:text-neutral-500"
                aria-label="Branch: main"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="6" y1="3" x2="6" y2="15" />
                  <circle cx="18" cy="6" r="3" />
                  <circle cx="6" cy="18" r="3" />
                  <path d="M18 9a9 9 0 0 1-9 9" />
                </svg>
                main
              </span>
            </div>
            <span className="hidden font-mono text-xs text-ink/40 sm:block dark:text-neutral-500">
              3 agents · 47 steps · 1 finding
            </span>
          </div>

          <div className="grid md:grid-cols-2">
            {/* Agent trace */}
            <div className="border-b border-ink/10 p-5 md:border-b-0 md:border-r dark:border-white/10">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink/40 dark:text-neutral-500">
                Agent trace
              </p>
              <div className="mt-4 space-y-2.5 font-mono text-[13px] leading-relaxed">
                <p className="text-ink/40 dark:text-neutral-500">
                  <span className="text-ink/70 dark:text-neutral-300">agent-2</span> loaded
                  /checkout
                </p>
                <p className="text-ink/40 dark:text-neutral-500">
                  <span className="text-ink/70 dark:text-neutral-300">agent-2</span> selected
                  plan “Pro”
                </p>
                <p className="text-ink/40 dark:text-neutral-500">
                  <span className="text-ink/70 dark:text-neutral-300">agent-2</span> clicked “Pay
                  now” — no response
                </p>
                <p className="text-ink/40 dark:text-neutral-500">
                  <span className="text-ink/70 dark:text-neutral-300">agent-2</span> retried 3× —
                  still nothing
                </p>
                <p className="text-red-400">
                  ✕ BUG: checkout button dead after plan select
                </p>
                <p className="text-ink/40 dark:text-neutral-500">
                  captured screenshot, console log, network trace
                </p>
                <p className="text-ink/40 dark:text-neutral-500">
                  <span className="text-ink/70 dark:text-neutral-300">judge</span> root cause:
                  handler reads plan from a stale closure
                </p>
                <p className="text-emerald-400">
                  ✓ fix ready — opening pull request
                </p>
              </div>
            </div>

            {/* PR diff */}
            <div className="p-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink/40 dark:text-neutral-500">
                Fix diff
              </p>
              <div className="mt-4 overflow-x-auto rounded-lg border border-ink/10 bg-ink/5 p-4 font-mono text-[13px] leading-relaxed dark:border-white/10 dark:bg-black/40">
                <p className="text-ink/40 dark:text-neutral-500">
                  --- a/app/checkout/page.tsx
                </p>
                <p className="text-ink/40 dark:text-neutral-500">
                  +++ b/app/checkout/page.tsx
                </p>
                <p className="mt-2 text-ink/40 dark:text-neutral-600">@@ -88,7 +88,7 @@</p>
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
                <p className="whitespace-pre text-ink/70 dark:text-neutral-300">
                  {"    "}Pay now
                </p>
                <p className="whitespace-pre text-ink/70 dark:text-neutral-300">
                  {"  "}&lt;/button&gt;
                </p>
              </div>
            </div>
          </div>

          {/* Run footer */}
          <div className="flex items-center justify-between border-t border-ink/10 px-5 py-3.5 dark:border-white/10">
            <p className="flex items-center gap-2 text-sm text-ink/60 dark:text-neutral-400">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="shrink-0 text-ink/40 dark:text-neutral-500"
                aria-hidden="true"
              >
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
              </svg>
              <span>
                <a
                  href="#early-access"
                  className="font-medium text-primary transition-colors duration-150 hover:text-ink dark:hover:text-white"
                >
                  PR #436
                </a>{" "}
                opened with the fix and full evidence
              </span>
            </p>
            <span className="hidden font-mono text-xs text-ink/40 sm:block dark:text-neutral-500">
              awaiting your merge
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
