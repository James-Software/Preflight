import PreflightDemo from "./PreflightDemo/PreflightDemo";

const DIFFERENCES = [
  {
    title: "Less scripting. More exploring.",
    body: "Agents navigate real workflows, including signed-in pages, without you scripting every click.",
  },
  {
    title: "Findings with receipts.",
    body: "Screenshots, console logs and network traces show what happened. Source investigation helps explain why.",
  },
  {
    title: "Check what actually changed.",
    body: "Connect a database to verify supported actions saved their changes. Review proposed fixes and open a PR when you're ready.",
  },
];

export default function ProductOverview() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="product-overview-title"
      className="product-overview scroll-mt-24 bg-page px-6 py-24 text-ink md:py-36 dark:text-white"
    >
      <div className="mx-auto max-w-6xl">
        <div className="flight-mark mx-auto" aria-hidden="true">
          <svg className="flight-wind" viewBox="0 0 520 240" fill="none">
            <path d="M90 54h106q16 0 24-9" />
            <path d="M330 60h106" />
            <path d="M20 103h123" />
            <path d="M391 102h109" />
            <path d="M44 148h92" />
            <path d="M382 151h110" />
            <path d="M112 193h102q16 0 26-9" />
            <path d="M312 190h104" />
          </svg>
          <div className="flight-logo">
            {/* Transparent artwork: no badge, frame or background. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" width="200" height="72" alt="" className="block w-full dark:hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-white.png" width="378" height="136" alt="" className="hidden w-full dark:block" />
          </div>
        </div>

        <div className="mx-auto mt-8 max-w-3xl text-center md:mt-10">
          <h2 id="product-overview-title" className="text-balance text-4xl font-semibold leading-[1.1] tracking-[-0.04em] md:text-5xl lg:text-6xl">
            Your app. Tested beyond<br className="hidden sm:block" /> the happy path.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-pretty text-base leading-relaxed text-muted md:text-lg">
            Give PreFlight your app. AI agents use it in real browsers, investigate
            what breaks, and bring back evidence and proposed fixes.
          </p>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-base leading-relaxed text-muted md:text-lg">
            Traditional test suites cover the paths you write. PreFlight helps
            explore the gaps.
          </p>
        </div>

        <PreflightDemo />

        <div className="mt-14 grid gap-8 border-t border-line pt-8 md:mt-20 md:grid-cols-3 md:gap-12 md:pt-10">
          {DIFFERENCES.map(({ title, body }) => (
            <div key={title}>
              <h3 className="text-base font-semibold tracking-tight">{title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
