import PlasmaSquare from "./PlasmaSquare";

/* ------------------------------------------------------------------ */
/* Hero — one big square filling ~96% of the viewport, rendered as     */
/* living plasma in the classic gradient's blues (#4e2fd8 → #6a6df5   */
/* → #8aa5ff, diagonal to top-right). The square is identical in both  */
/* themes (white headline stays on the plasma); only the page behind   */
/* it flips (#fafafa light, #05060a dark).                             */
/* ------------------------------------------------------------------ */

export default function Hero() {
  return (
    <section
      id="top"
      className="relative flex min-h-svh flex-col overflow-x-clip dark:bg-[#05060a]"
    >
      <div className="flex min-w-0 flex-1 px-[2vw] pb-[2vh] pt-[84px]">
        <div
          className="relative flex min-w-0 w-full flex-1 items-center justify-center rounded-[1.75rem] md:rounded-[2.5rem]"
          style={{ background: "none", border: 0, boxShadow: "none" }}
        >
          {/* The square itself: living plasma in the classic gradient's
              blues. The shader supplies its rounded silhouette; the layout
              box stays unpainted and does not clip the transparent canvas. */}
          <PlasmaSquare />

          <div className="relative min-w-0 w-full px-12 pb-14 pt-24 text-center sm:px-16 sm:pb-20 sm:pt-28 md:px-12 md:py-24">
            <h1
              className="animate-hero-rise mx-auto max-w-4xl text-balance font-sans text-[clamp(2rem,9vw,3rem)] leading-[1.08] font-semibold tracking-[-0.035em] text-white sm:text-6xl md:text-8xl"
              style={{ textShadow: "0 2px 24px rgba(30,20,120,0.35)" }}
            >
              Is your app ready to fly?
            </h1>
            <p
              className="animate-hero-rise mx-auto mt-5 max-w-[30ch] text-base leading-relaxed text-pretty text-white/80 sm:mt-6 sm:max-w-xl sm:text-lg"
              style={{ animationDelay: "120ms" }}
            >
              PreFlight sends a swarm of AI agents to test your app like real
              users. Every bug they find comes back as fix.
            </p>
            <div
              className="animate-hero-rise mx-auto mt-7 flex w-full max-w-xs flex-col items-center justify-center gap-3 sm:mt-9 sm:max-w-none sm:flex-row"
              style={{ animationDelay: "240ms" }}
            >
              <a
                href="#early-access"
                className="pressable flex min-h-12 w-full items-center justify-center rounded-full bg-white px-5 py-3.5 text-sm font-semibold text-ink shadow-[0_10px_30px_-8px_rgba(20,16,80,0.5)] transition-colors duration-150 hover:bg-white/90 sm:w-auto sm:px-7"
              >
                Get early access
              </a>
              <a
                href="#how-it-works"
                className="pressable flex min-h-12 w-full items-center justify-center rounded-full border border-white/35 px-5 py-3.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-white/10 sm:w-auto sm:px-7"
              >
                See how it works
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
