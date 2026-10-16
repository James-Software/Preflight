/**
 * Install strip: one action, one docs link. (Supabase / Resend pattern —
 * the install is the CTA.)
 */
export default function InstallStrip() {
  return (
    <section className="bg-[#05060a] py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col items-start justify-between gap-8 rounded-xl border border-white/10 bg-[#0a0c14] p-8 md:flex-row md:items-center md:p-10">
          <div>
            <h2 className="text-balance text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Run your first swarm tonight.
            </h2>
            <p className="mt-3 max-w-md text-base leading-relaxed text-neutral-400">
              Install the GitHub App, pick a repo, and wake up to findings.{" "}
              <a
                href="#early-access"
                className="text-white underline underline-offset-4 decoration-white/30 transition-colors duration-150 hover:decoration-white"
              >
                Read the docs
              </a>
            </p>
          </div>
          <a
            href="https://github.com/apps/preflight-qa"
            className="pressable btn-gradient inline-flex shrink-0 items-center gap-2.5 rounded-full px-7 py-3.5 text-sm font-medium text-white"
          >
            Install the GitHub App
          </a>
        </div>
      </div>
    </section>
  );
}
