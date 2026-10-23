import LegalContents, { legalSectionId } from "@/components/LegalContents";
import type { Metadata } from "next";
import { TERMS_SECTIONS as SECTIONS } from "@/lib/content/legal";
import { publicAlternates } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  alternates: publicAlternates("/terms"),
  description:
    "The terms governing your use of PreFlight: testing, GitHub integration, credits, and payments.",
};

export default function TermsPage() {
  return (
    <main className="bg-page">
      <div className="mx-auto max-w-3xl px-6 pb-20 pt-32 md:pb-28 md:pt-36">
        <a
          href="/"
          className="text-sm font-medium text-muted transition-colors duration-150 hover:text-ink dark:text-muted dark:hover:text-white"
        >
          &larr; Back to PreFlight
        </a>
        <h1 className="font-sans mt-8 text-4xl font-semibold tracking-tight text-ink md:text-5xl dark:text-white">
          Terms of Service
        </h1>
        <p className="mt-4 text-sm text-muted dark:text-muted">
          Effective October 12, 2026
        </p>
        <p className="mt-8 text-base leading-relaxed text-ink/70 dark:text-neutral-300">
          These terms govern your use of PreFlight, the agent swarm that tests
          your app like real users and proposes fixes as pull requests. Please
          read them carefully.
        </p>
        <LegalContents headings={SECTIONS.map((section) => section.heading)} />
        <div className="mt-12 space-y-10">
          {SECTIONS.map((s) => (
            <section
              key={s.heading}
              id={legalSectionId(s.heading)}
              className="scroll-mt-28"
            >
              <h2 className="font-sans text-xl font-semibold tracking-tight text-ink dark:text-white">
                {s.heading}
              </h2>
              <div className="mt-3 space-y-3">
                {s.body.map((p, i) => (
                  <p
                    key={i}
                    className="text-base leading-relaxed text-ink/70 dark:text-neutral-300"
                  >
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
