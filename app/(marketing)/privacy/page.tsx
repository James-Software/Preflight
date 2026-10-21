import type { Metadata } from "next";
import { PRIVACY_SECTIONS as SECTIONS } from "@/lib/content/legal";
import { publicAlternates } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  alternates: publicAlternates("/privacy"),
  description:
    "How PreFlight collects, uses, and protects your data across waitlist, testing, GitHub integration, and payments.",
};



export default function PrivacyPage() {
  return (
    <main className="bg-page">
      <div className="mx-auto max-w-3xl px-6 pb-20 pt-32 md:pb-28 md:pt-36">
        <a
          href="/"
          className="text-sm font-medium text-ink/50 transition-colors duration-150 hover:text-ink dark:text-white/50 dark:hover:text-white"
        >
          &larr; Back to PreFlight
        </a>
        <h1 className="font-sans mt-8 text-4xl font-semibold tracking-tight text-ink md:text-5xl dark:text-white">
          Privacy Policy
        </h1>
        <p className="mt-4 text-sm text-ink/50 dark:text-white/50">
          Effective October 12, 2026
        </p>
        <p className="mt-8 text-base leading-relaxed text-ink/70 dark:text-neutral-300">
          PreFlight (&ldquo;we&rdquo;, &ldquo;us&rdquo;) sends a swarm of AI
          agents to test your application like real users, diagnoses what
          they find from your code, and proposes fixes as pull requests.
          This policy explains what data we collect across the whole product (waitlist, accounts, testing, GitHub integration, and payments), why we collect it, and what we do with it.
        </p>
        <div className="mt-12 space-y-10">
          {SECTIONS.map((s) => (
            <section key={s.heading}>
              <h2 className="font-sans text-xl font-semibold tracking-tight text-ink dark:text-white">
                {s.heading}
              </h2>
              <div className="mt-3 space-y-3">
                {s.body.map((p, i) => (
                  <p
                    key={i}
                    className="text-[15px] leading-relaxed text-ink/70 dark:text-neutral-300"
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
